import { useState, useEffect, useRef } from "react";
import { motion } from "framer-motion";
import { Send } from "lucide-react";
import { Button } from "@/app/components/ui/button";
import { Input } from "@/app/components/ui/input";
import { ScrollArea } from "@/app/components/ui/scroll-area";

/**
 * @typedef {Object} Message
 * @property {string} type
 * @property {string} from
 * @property {string} to
 * @property {string} content
 */

export default function Chat({ socket, username, selectedFriend }) {
  const [inputMessage, setInputMessage] = useState("");
  const [chatHistory, setChatHistory] = useState({});

  const scrollAreaRef = useRef(null);

  useEffect(() => {
    if (selectedFriend) {
      setChatHistory((prev) => ({
        ...prev,
        [selectedFriend]: prev[selectedFriend] || [],
      }));

      if (socket && socket.readyState === WebSocket.OPEN) {
        socket.send(
          JSON.stringify({
            type: "load_chat_history",
            from: username,
            to: selectedFriend,
          })
        );
      } else if (socket) {
        const handleOpen = () => {
          socket.send(
            JSON.stringify({
              type: "load_chat_history",
              from: username,
              to: selectedFriend,
            })
          );
        };

        socket.addEventListener("open", handleOpen);

        return () => {
          socket.removeEventListener("open", handleOpen);
        };
      }
    }
  }, [selectedFriend, socket, username]);

  useEffect(() => {
    if (socket) {
      socket.onmessage = (event) => {
        const data = JSON.parse(event.data);

        if (data.type === "message") {
          const isRelevantMessage =
            (data.from === selectedFriend && data.to === username) ||
            (data.from === username && data.to === selectedFriend);

          if (isRelevantMessage) {
            setChatHistory((prev) => ({
              ...prev,
              [selectedFriend]: [...(prev[selectedFriend] || []), data],
            }));
          }
        } else if (data.type === "chat_history" && data.chat) {
          setChatHistory((prev) => ({
            ...prev,
            [selectedFriend]: data.chat,
          }));
        }
      };
    }
  }, [socket, selectedFriend, username]);

  useEffect(() => {
    if (scrollAreaRef.current) {
      scrollAreaRef.current.scrollTop = scrollAreaRef.current.scrollHeight;
    }
  }, [chatHistory]);

  const sendMessage = (e) => {
    e.preventDefault();
    if (inputMessage.trim() && socket && socket.readyState === WebSocket.OPEN) {
      const messageData = {
        type: "message",
        from: username,
        to: selectedFriend,
        content: inputMessage,
      };
      socket.send(JSON.stringify(messageData));
      setInputMessage("");
    }
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
              key={index}
              initial={{ opacity: 0, y: 10 }}
              animate={{ opacity: 1, y: 0 }}
              transition={{ duration: 0.3 }}
              className={`p-3 rounded-lg max-w-[80%] ${
                msg.from === username
                  ? "bg-blue-600 text-white ml-auto"
                  : "bg-zinc-700 text-gray-200"
              }`}
            >
              <p className="text-sm opacity-75 mb-1">{msg.from}</p>
              <p className="break-words">{msg.content}</p>
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
