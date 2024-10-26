import { useState, useEffect } from "react";

/**
 * @typedef {Object} FriendListProps
 * @property {WebSocket|null} socket
 * @property {string} username
 * @property {(friend: string) => void} onSelectFriend
 */

export default function Component({ socket, username, onSelectFriend }) {
  const [friends, setFriends] = useState(["AI Assistant"]);

  useEffect(() => {
    if (socket) {
      const handleMessage = (event) => {
        const data = JSON.parse(event.data);
        if (
          data.type === "friend_added" &&
          (data.from === username || data.to === username)
        ) {
          setFriends((prevFriends) => [
            ...prevFriends,
            data.from === username ? data.to : data.from,
          ]);
        }
      };

      socket.addEventListener("message", handleMessage);

      return () => {
        socket.removeEventListener("message", handleMessage);
      };
    }
  }, [socket, username]);

  return (
    <ul className="space-y-2">
      {friends.map((friend) => (
        <li
          key={friend}
          className="p-2 bg-gray-100 rounded cursor-pointer hover:bg-gray-200"
          onClick={() => onSelectFriend(friend)}
        >
          {friend}
        </li>
      ))}
    </ul>
  );
}
