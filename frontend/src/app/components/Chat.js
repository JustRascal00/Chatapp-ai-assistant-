import { useState, useEffect, useRef } from "react";
import { motion } from "framer-motion";
import { Send, Check, CheckCheck, Loader2 } from "lucide-react";
import { Button } from "@/app/components/ui/button";
import { Input } from "@/app/components/ui/input";
import { ScrollArea } from "@/app/components/ui/scroll-area";
import MessageReactions from "./MessageReactions";
import SmartReplySuggestions from "./SmartReplySuggestions";

export default function Chat({
  socket,
  username,
  selectedFriend,
  onMessageReceived,
}) {
  const [inputMessage, setInputMessage] = useState("");
  const [chatHistory, setChatHistory] = useState({});
  const [isTyping, setIsTyping] = useState(false);
  const [friendIsTyping, setFriendIsTyping] = useState(false);
  const messageIds = useRef(new Set());
  const scrollAreaRef = useRef(null);
  const typingTimeoutRef = useRef(null);

  const messageUpdateTimeRef = useRef({});

  useEffect(() => {
    if (selectedFriend) {
      setChatHistory((prev) => ({
        ...prev,
        [selectedFriend]: prev[selectedFriend] || [],
      }));

      if (socket && socket.readyState === WebSocket.OPEN) {
        socket.send(
          JSON.stringify({
            type: "mark_messages_read",
            reader: username,
            sender: selectedFriend,
          })
        );

        socket.send(
          JSON.stringify({
            type: "load_chat_history",
            from: username,
            to: selectedFriend,
          })
        );
      }
    }
  }, [selectedFriend, socket, username]);

  // Updated handleIncomingMessage function with improved reaction handling
  useEffect(() => {
    const handleIncomingMessage = (event) => {
      const data = JSON.parse(event.data);

      if (data.type === "reaction_update") {
        console.log("Received reaction update:", data);

        // Update all chat histories that contain this message
        setChatHistory((prev) => {
          const newHistory = { ...prev };
          let hasUpdates = false;

          // Helper function to update message reactions
          const updateMessageReactions = (messages) => {
            if (!messages) return messages;

            return messages.map((msg) => {
              if (msg._id === data.messageId) {
                // Check if this update is newer than our last recorded update
                const lastUpdate = messageUpdateTimeRef.current[msg._id] || 0;
                const currentTime = Date.now();

                if (currentTime > lastUpdate) {
                  messageUpdateTimeRef.current[msg._id] = currentTime;
                  hasUpdates = true;
                  return {
                    ...msg,
                    reactions: data.reactions,
                  };
                }
              }
              return msg;
            });
          };

          // Update messages in all chats
          Object.keys(newHistory).forEach((friend) => {
            const updatedMessages = updateMessageReactions(newHistory[friend]);
            if (updatedMessages) {
              newHistory[friend] = updatedMessages;
            }
          });

          // Only trigger re-render if we actually made updates
          return hasUpdates ? newHistory : prev;
        });
      }

      if (data.type === "message") {
        const getMessageKey = (m) =>
          m._id ||
          `${m.from}-${m.to}-${m.timestamp}-${(m.content || "").slice(0, 20)}`;
        const isRelevantMessage =
          (data.from === selectedFriend && data.to === username) ||
          (data.from === username && data.to === selectedFriend);

        const key = getMessageKey(data);
        if (isRelevantMessage && !messageIds.current.has(key)) {
          messageIds.current.add(key);

          const messageWithTimestamp = {
            ...data,
            timestamp: data.timestamp || new Date().toISOString(),
            reactions: data.reactions || [], // Ensure reactions array exists
          };

          setChatHistory((prev) => {
            const existingMessages = prev[selectedFriend] || [];
            return {
              ...prev,
              [selectedFriend]: [...existingMessages, messageWithTimestamp],
            };
          });

          if (data.from !== username) {
            onMessageReceived(data.from);
          }

          if (
            data.from === selectedFriend &&
            socket.readyState === WebSocket.OPEN
          ) {
            socket.send(
              JSON.stringify({
                type: "mark_messages_read",
                reader: username,
                sender: selectedFriend,
              })
            );
          }
        }
      } else if (data.type === "typing_status") {
        if (data.from === selectedFriend) {
          setFriendIsTyping(data.isTyping);
        }
      } else if (data.type === "messages_read") {
        setChatHistory((prev) => ({
          ...prev,
          [selectedFriend]: (prev[selectedFriend] || []).map((msg) => ({
            ...msg,
            read: msg.from === username ? true : msg.read,
            readAt: msg.from === username ? data.timestamp : msg.readAt,
          })),
        }));
      } else if (data.type === "chat_history" && data.chat) {
        messageIds.current.clear();
        // seed the set to prevent duplicates when live updates arrive
        data.chat.forEach((m) => {
          const k =
            m._id ||
            `${m.from}-${m.to}-${m.timestamp}-${(m.content || "").slice(
              0,
              20
            )}`;
          messageIds.current.add(k);
        });

        // Ensure all messages have a reactions array
        const chatWithReactions = data.chat.map((msg) => ({
          ...msg,
          reactions: msg.reactions || [],
        }));

        setChatHistory((prev) => ({
          ...prev,
          [selectedFriend]: chatWithReactions,
        }));
      }
    };

    if (socket) {
      socket.addEventListener("message", handleIncomingMessage);
    }

    return () => {
      if (socket) {
        socket.removeEventListener("message", handleIncomingMessage);
      }
    };
  }, [socket, selectedFriend, username, onMessageReceived]);

  useEffect(() => {
    if (scrollAreaRef.current) {
      scrollAreaRef.current.scrollTop = scrollAreaRef.current.scrollHeight;
    }
  }, [chatHistory, selectedFriend]);

  // Handle typing status
  const handleTyping = () => {
    if (!isTyping) {
      setIsTyping(true);
      socket.send(
        JSON.stringify({
          type: "typing_status",
          from: username,
          to: selectedFriend,
          isTyping: true,
        })
      );
    }

    // Clear existing timeout
    if (typingTimeoutRef.current) {
      clearTimeout(typingTimeoutRef.current);
    }

    // Set new timeout
    typingTimeoutRef.current = setTimeout(() => {
      setIsTyping(false);
      socket.send(
        JSON.stringify({
          type: "typing_status",
          from: username,
          to: selectedFriend,
          isTyping: false,
        })
      );
    }, 1000);
  };

  const formatTimestamp = (timestamp) => {
    if (!timestamp) return "";
    try {
      return new Date(timestamp).toLocaleTimeString([], {
        hour: "2-digit",
        minute: "2-digit",
      });
    } catch (e) {
      console.error("Invalid timestamp:", timestamp);
      return "";
    }
  };

  const sendMessage = (e) => {
    e.preventDefault();
    if (inputMessage.trim() && socket && socket.readyState === WebSocket.OPEN) {
      const timestamp = new Date().toISOString();
      const messageData = {
        type: "message",
        from: username,
        to: selectedFriend,
        content: inputMessage,
        timestamp,
        read: false,
      };

      setChatHistory((prev) => ({
        ...prev,
        [selectedFriend]: [...(prev[selectedFriend] || []), messageData],
      }));

      socket.send(JSON.stringify(messageData));
      setInputMessage("");

      // Clear typing status
      if (typingTimeoutRef.current) {
        clearTimeout(typingTimeoutRef.current);
      }
      setIsTyping(false);
      socket.send(
        JSON.stringify({
          type: "typing_status",
          from: username,
          to: selectedFriend,
          isTyping: false,
        })
      );
    }
  };

  const getReadStatus = (message) => {
    if (message.from !== username) return null;

    if (message.read && message.readAt) {
      return (
        <div className="flex items-center space-x-1 text-xs text-gray-400">
          <CheckCheck className="h-3 w-3" />
          <span>Read {formatTimestamp(message.readAt)}</span>
        </div>
      );
    }
    return <Check className="h-3 w-3 text-gray-400" />;
  };

  return (
    <div className="flex flex-col h-full bg-zinc-900 rounded-lg shadow-lg">
      <div className="p-4 bg-zinc-800 rounded-t-lg flex justify-between items-center">
        <div className="flex items-center space-x-2">
          <h2 className="text-xl font-bold text-gray-100">
            Chat with {selectedFriend}
          </h2>
          {friendIsTyping && (
            <div className="flex items-center space-x-2 text-gray-400">
              <Loader2 className="h-4 w-4 animate-spin" />
              <span className="text-sm">typing...</span>
            </div>
          )}
        </div>
        <div className="flex items-center space-x-2">
          <span className="text-sm text-gray-400">Logged in as:</span>
          <span className="text-sm font-semibold text-gray-100">
            {username}
          </span>
        </div>
      </div>

      <ScrollArea className="flex-1 p-4" ref={scrollAreaRef}>
        <div className="space-y-4">
          {chatHistory[selectedFriend]?.map((msg, index) => (
            <motion.div
              key={`${
                msg._id || `${msg.from}-${msg.to}-${msg.timestamp}-${index}`
              }`}
              initial={{ opacity: 0, y: 10 }}
              animate={{ opacity: 1, y: 0 }}
              transition={{ duration: 0.3 }}
              className={`p-3 rounded-lg max-w-[80%] ${
                msg.from === username
                  ? "bg-blue-600 text-white ml-auto"
                  : "bg-zinc-700 text-gray-200"
              }`}
            >
              <div className="flex justify-between items-start mb-1">
                <p className="text-sm opacity-75">{msg.from}</p>
                <span className="text-xs opacity-50">
                  {formatTimestamp(msg.timestamp)}
                </span>
              </div>
              <p className="break-words">{msg.content}</p>
              <div className="mt-2 flex items-center justify-between">
                {getReadStatus(msg)}
                <MessageReactions
                  message={msg}
                  socket={socket}
                  username={username}
                  selectedFriend={selectedFriend}
                />
              </div>
            </motion.div>
          ))}
        </div>
      </ScrollArea>

      <form onSubmit={sendMessage} className="p-4 bg-zinc-800 rounded-b-lg">
        <div className="flex items-center space-x-2">
          <Input
            type="text"
            value={inputMessage}
            onChange={(e) => {
              setInputMessage(e.target.value);
              handleTyping();
            }}
            className="flex-1 bg-zinc-700 text-gray-100 placeholder-gray-400"
            placeholder="Type a message..."
          />
          <Button
            type="submit"
            size="icon"
            className="bg-blue-600 hover:bg-blue-700"
          >
            <Send className="h-4 w-4" />
          </Button>
        </div>
      </form>
      <SmartReplySuggestions
        socket={socket}
        username={username}
        selectedFriend={selectedFriend}
        chatHistory={chatHistory}
      />
    </div>
  );
}
