import { useState, useEffect } from "react";

export default function FriendList({ socket, username, onSelectFriend }) {
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
    <ul className="space-y-2">
      {friends.map((friend) => (
        <li
          key={friend}
          className="p-2 bg-zinc-700 rounded cursor-pointer hover:bg-zinc-600 transition-all flex items-center justify-between"
          onClick={() => onSelectFriend(friend)}
        >
          <span>{friend}</span>
          {friend === "AI Assistant" && (
            <span className="text-xs bg-blue-500 rounded-full px-2 py-1">
              AI
            </span>
          )}
        </li>
      ))}
    </ul>
  );
}
