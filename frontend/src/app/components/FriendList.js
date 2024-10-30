import { useState, useEffect } from "react";
import { motion } from "framer-motion";
import { User, Bot } from "lucide-react";

export default function FriendList({
  socket,
  username,
  onSelectFriend,
  unreadMessages = {},
}) {
  const [friends, setFriends] = useState(["AI Assistant"]);

  useEffect(() => {
    if (!socket) return;

    const handleMessage = (event) => {
      const data = JSON.parse(event.data);

      // Handle friend list updates
      if (data.type === "friends_list") {
        const updatedFriends = [
          "AI Assistant",
          ...data.friends.filter((friend) => friend !== "AI Assistant"),
        ];
        setFriends((prev) => {
          // Only update if the friends list has actually changed
          if (JSON.stringify(prev) !== JSON.stringify(updatedFriends)) {
            return updatedFriends;
          }
          return prev;
        });
      }

      // Handle new friend added notifications
      if (data.type === "friend_added") {
        setFriends((prev) => {
          if (data.from === username && !prev.includes(data.to)) {
            return [...prev, data.to];
          } else if (data.to === username && !prev.includes(data.from)) {
            return [...prev, data.from];
          }
          return prev;
        });
      }
    };

    const requestFriendsList = () => {
      if (socket.readyState === WebSocket.OPEN) {
        socket.send(JSON.stringify({ type: "get_friends", username }));
      }
    };

    // Add event listeners
    socket.addEventListener("message", handleMessage);

    if (socket.readyState === WebSocket.OPEN) {
      requestFriendsList();
    } else {
      socket.addEventListener("open", requestFriendsList);
    }

    // Cleanup
    return () => {
      socket.removeEventListener("message", handleMessage);
      socket.removeEventListener("open", requestFriendsList);
    };
  }, [socket, username]); // Removed 'friends' from dependencies

  const getUnreadCount = (friend) => {
    const count = unreadMessages[friend];
    return count > 0 ? count : 0;
  };

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
          {getUnreadCount(friend) > 0 && (
            <span className="text-xs bg-red-500 text-white rounded-full px-2 py-1">
              {getUnreadCount(friend)}
            </span>
          )}
        </motion.li>
      ))}
    </motion.ul>
  );
}
