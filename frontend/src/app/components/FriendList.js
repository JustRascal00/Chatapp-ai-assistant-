import { useState, useEffect } from "react";

export default function FriendList({ socket }) {
  const [friends, setFriends] = useState(["AI Assistant"]);

  useEffect(() => {
    if (socket) {
      socket.onmessage = (event) => {
        const data = JSON.parse(event.data);
        if (data.type === "friend_added") {
          setFriends((prevFriends) => [...prevFriends, data.to]);
        }
      };
    }
  }, [socket]);

  return (
    <ul className="space-y-2">
      {friends.map((friend) => (
        <li key={friend} className="p-2 bg-gray-100 rounded">
          {friend}
        </li>
      ))}
    </ul>
  );
}
