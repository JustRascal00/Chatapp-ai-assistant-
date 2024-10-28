import { useState, useEffect } from "react";
import { motion } from "framer-motion";
import { User, Bot } from "lucide-react";

export default function FriendList({
  socket,
  username,
  onSelectFriend,
  unreadMessages = {}, // Default to an empty object
}) {
  const [friends, setFriends] = useState(["AI Assistant"]); // Initialize with "AI Assistant"

  useEffect(() => {
    if (socket) {
      const handleMessage = (event) => {
        const data = JSON.parse(event.data);

        // Handle friend list updates
        if (data.type === "friends_list") {
          const updatedFriends = [
            "AI Assistant",
            ...data.friends.filter((friend) => friend !== "AI Assistant"),
          ];
          setFriends(updatedFriends);
        }

        // Handle new friend added notifications
        if (data.type === "friend_added") {
          if (data.from === username && !friends.includes(data.to)) {
            setFriends((prev) => [...prev, data.to]);
          } else if (data.to === username && !friends.includes(data.from)) {
            setFriends((prev) => [...prev, data.from]);
          }
        }
      };

      socket.addEventListener("message", handleMessage);

      // Send initial friends list request
      const requestFriendsList = () => {
        socket.send(JSON.stringify({ type: "get_friends", username }));
      };

      if (socket.readyState === WebSocket.OPEN) {
        requestFriendsList();
      } else {
        socket.addEventListener("open", requestFriendsList);
      }

      return () => {
        socket.removeEventListener("message", handleMessage);
        socket.removeEventListener("open", requestFriendsList);
      };
    }
  }, [socket, username, friends]);

  return (
    <motion.ul
      initial={{ opacity: 0 }}
      animate={{ opacity: 1 }}
      transition={{ duration: 0.5 }}
      className="space-y-2"
    >
      {friends.map((friend) => (
        <motion.li
          key={friend}
          whileHover={{ scale: 1.05 }}
          whileTap={{ scale: 0.95 }}
          className="p-3 bg-zinc-700 rounded-lg cursor-pointer hover:bg-zinc-600 transition-all flex items-center justify-between"
          onClick={() => onSelectFriend(friend)}
        >
          <div className="flex items-center space-x-3">
            {friend === "AI Assistant" ? (
              <Bot className="h-5 w-5 text-blue-400" />
            ) : (
              <User className="h-5 w-5 text-gray-400" />
            )}
            <span className="text-gray-200">{friend}</span>
          </div>
          {(unreadMessages[friend] || 0) > 0 && ( // Use default value of 0
            <span className="text-xs bg-red-500 text-white rounded-full px-2 py-1">
              {unreadMessages[friend]}
            </span>
          )}
        </motion.li>
      ))}
    </motion.ul>
  );
}
