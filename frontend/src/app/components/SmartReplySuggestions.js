import React, { useState, useEffect } from "react";
import { motion } from "framer-motion";

const SmartReplySuggestions = ({
  socket,
  username,
  selectedFriend,
  chatHistory,
}) => {
  const [smartReplies, setSmartReplies] = useState([]);

  useEffect(() => {
    if (socket && socket.readyState === WebSocket.OPEN && selectedFriend) {
      // Request smart reply suggestions
      socket.send(
        JSON.stringify({
          type: "get_smart_replies",
          from: username,
          to: selectedFriend,
          context: {
            messages: chatHistory[selectedFriend]?.slice(-3) || [],
          },
        })
      );
    }
  }, [selectedFriend, chatHistory, username, socket]);

  useEffect(() => {
    const handleSmartReplies = (event) => {
      const data = JSON.parse(event.data);
      if (data.type === "smart_replies") {
        setSmartReplies(data.suggestions);
      }
    };

    if (socket) {
      socket.addEventListener("message", handleSmartReplies);
    }

    return () => {
      if (socket) {
        socket.removeEventListener("message", handleSmartReplies);
      }
    };
  }, [socket]);

  const sendQuickReply = (reply) => {
    if (socket && socket.readyState === WebSocket.OPEN) {
      socket.send(
        JSON.stringify({
          type: "message",
          from: username,
          to: selectedFriend,
          content: reply,
        })
      );
    }
  };

  if (!smartReplies.length) return null;

  return (
    <div className="flex space-x-2 p-2 bg-zinc-800 rounded-b-lg overflow-x-auto">
      {smartReplies.map((reply, index) => (
        <motion.button
          key={index}
          initial={{ opacity: 0, y: 10 }}
          animate={{ opacity: 1, y: 0 }}
          transition={{ delay: index * 0.1 }}
          className="px-3 py-1 bg-blue-600 text-white text-sm rounded-full hover:bg-blue-700 transition-colors"
          onClick={() => sendQuickReply(reply)}
        >
          {reply}
        </motion.button>
      ))}
    </div>
  );
};

export default SmartReplySuggestions;
