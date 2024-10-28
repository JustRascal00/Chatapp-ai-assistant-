import { useState, useEffect, useRef } from "react";
import { motion } from "framer-motion";
import { Send, Check, CheckCheck } from "lucide-react";
import { Button } from "@/app/components/ui/button";
import { Input } from "@/app/components/ui/input";
import { ScrollArea } from "@/app/components/ui/scroll-area";

export default function Chat({
  socket,
  username,
  selectedFriend,
  onMessageReceived,
}) {
  const [inputMessage, setInputMessage] = useState("");
  const [chatHistory, setChatHistory] = useState({});
  const messageIds = useRef(new Set());
  const scrollAreaRef = useRef(null);

  useEffect(() => {
    if (selectedFriend) {
      setChatHistory((prev) => ({
        ...prev,
        [selectedFriend]: prev[selectedFriend] || [],
      }));

      if (socket && socket.readyState === WebSocket.OPEN) {
        // Mark all unread messages as read when opening chat
        socket.send(
          JSON.stringify({
            type: "mark_messages_read",
            reader: username,
            sender: selectedFriend,
          })
        );

        // Request chat history
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

  useEffect(() => {
    const handleIncomingMessage = (event) => {
      const data = JSON.parse(event.data);

      if (data.type === "message") {
        const isRelevantMessage =
          (data.from === selectedFriend && data.to === username) ||
          (data.from === username && data.to === selectedFriend);

        if (isRelevantMessage) {
          const messageId = `${data.from}-${data.to}-${data.content}-${data.timestamp}`;

          if (!messageIds.current.has(messageId)) {
            messageIds.current.add(messageId);
            // Ensure the message has a timestamp
            const messageWithTimestamp = {
              ...data,
              timestamp: data.timestamp || new Date().toISOString(),
            };

            setChatHistory((prev) => ({
              ...prev,
              [selectedFriend]: [
                ...(prev[selectedFriend] || []),
                messageWithTimestamp,
              ],
            }));

            // Notify parent component about the new message
            if (data.from !== username) {
              onMessageReceived(data.from);
            }

            // If we receive a message and we're the recipient, mark it as read
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
        }
      } else if (data.type === "messages_read") {
        // Update read status for messages
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
        const filteredMessages = data.chat.filter((msg) => {
          const messageId = `${msg.from}-${msg.to}-${msg.content}-${msg.timestamp}`;
          const isDuplicate = messageIds.current.has(messageId);
          if (!isDuplicate) {
            messageIds.current.add(messageId);
            // Ensure each message has a timestamp
            return {
              ...msg,
              timestamp: msg.timestamp || new Date().toISOString(),
            };
          }
          return false;
        });

        setChatHistory((prev) => ({
          ...prev,
          [selectedFriend]: filteredMessages,
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
  }, [socket, selectedFriend, username]);

  useEffect(() => {
    if (scrollAreaRef.current) {
      scrollAreaRef.current.scrollTop = scrollAreaRef.current.scrollHeight;
    }
  }, [chatHistory, selectedFriend]);

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
      const messageData = {
        type: "message",
        from: username,
        to: selectedFriend,
        content: inputMessage,
        timestamp: new Date().toISOString(),
        read: false,
      };

      const messageId = `${username}-${selectedFriend}-${inputMessage}-${messageData.timestamp}`;

      if (!messageIds.current.has(messageId)) {
        messageIds.current.add(messageId);

        setChatHistory((prev) => ({
          ...prev,
          [selectedFriend]: [...(prev[selectedFriend] || []), messageData],
        }));

        socket.send(JSON.stringify(messageData));
        setInputMessage("");
      }
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
        <h2 className="text-xl font-bold text-gray-100">
          Chat with {selectedFriend}
        </h2>
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
              key={`${msg.from}-${msg.to}-${msg.content}-${index}`}
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
              {getReadStatus(msg)}
            </motion.div>
          ))}
        </div>
      </ScrollArea>

      <form onSubmit={sendMessage} className="p-4 bg-zinc-800 rounded-b-lg">
        <div className="flex items-center space-x-2">
          <Input
            type="text"
            value={inputMessage}
            onChange={(e) => setInputMessage(e.target.value)}
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
    </div>
  );
}
