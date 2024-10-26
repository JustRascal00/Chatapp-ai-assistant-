import { useState, useEffect } from "react";

/**
 * @typedef {Object} FriendRequestsProps
 * @property {WebSocket|null} socket
 * @property {string} username
 */

export default function Component({ socket, username }) {
  const [friendRequests, setFriendRequests] = useState([]);

  useEffect(() => {
    if (socket) {
      const handleMessage = (event) => {
        const data = JSON.parse(event.data);
        if (data.type === "friend_request" && data.to === username) {
          setFriendRequests((prev) => [...prev, data.from]);
        }
      };

      socket.addEventListener("message", handleMessage);

      return () => {
        socket.removeEventListener("message", handleMessage);
      };
    }
  }, [socket, username]);

  const handleAcceptRequest = (requester) => {
    if (socket) {
      socket.send(
        JSON.stringify({
          type: "accept_friend_request",
          from: username,
          to: requester,
        })
      );
      setFriendRequests((prev) => prev.filter((req) => req !== requester));
    }
  };

  return (
    <div className="mt-4">
      <h3 className="text-lg font-semibold mb-2">Friend Requests</h3>
      {friendRequests.length === 0 ? (
        <p>No pending friend requests</p>
      ) : (
        <ul>
          {friendRequests.map((requester) => (
            <li
              key={requester}
              className="flex items-center justify-between mb-2"
            >
              <span>{requester}</span>
              <button
                onClick={() => handleAcceptRequest(requester)}
                className="px-2 py-1 text-sm text-white bg-blue-500 rounded hover:bg-blue-600"
              >
                Accept
              </button>
            </li>
          ))}
        </ul>
      )}
    </div>
  );
}
