import { useState, useEffect } from "react";

export default function Component({ socket, username }) {
  const [friendRequests, setFriendRequests] = useState([]); // Ensure it's initialized as an empty array
  const [notification, setNotification] = useState("");

  useEffect(() => {
    if (socket) {
      const handleMessage = (event) => {
        const data = JSON.parse(event.data);

        if (data.type === "initial_data") {
          setFriendRequests(
            Array.isArray(data.friend_requests?.requests)
              ? data.friend_requests.requests
              : []
          );
        } else if (data.type === "friend_requests") {
          setFriendRequests(Array.isArray(data.requests) ? data.requests : []);
        } else if (data.type === "friend_request") {
          setFriendRequests((prev) => {
            if (!prev.includes(data.from)) {
              setNotification(`New friend request from ${data.from}`);
              setTimeout(() => setNotification(""), 3000);
              return [...prev, data.from];
            }
            return prev;
          });
        } else if (data.type === "friend_added") {
          setFriendRequests((prev) =>
            prev.filter((req) => req !== data.from && req !== data.to)
          );
          if (data.status === "success") {
            setNotification(`Friend request accepted`);
            setTimeout(() => setNotification(""), 3000);
          }
        }
      };

      socket.addEventListener("message", handleMessage);

      const requestInitialData = () => {
        socket.send(
          JSON.stringify({
            type: "get_friend_requests",
            username: username,
          })
        );
      };

      if (socket.readyState === WebSocket.OPEN) {
        requestInitialData();
      }
      socket.addEventListener("open", requestInitialData);

      return () => {
        socket.removeEventListener("message", handleMessage);
        socket.removeEventListener("open", requestInitialData);
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
    }
  };

  return (
    <div className="mt-4">
      <h3 className="text-lg font-semibold mb-2 text-gray-300">
        Friend Requests ({friendRequests.length})
      </h3>
      {notification && (
        <div className="mb-2 p-2 bg-blue-500 text-white rounded animate-fade-in">
          {notification}
        </div>
      )}
      {friendRequests.length === 0 ? (
        <p className="text-gray-400">No pending friend requests</p>
      ) : (
        <ul className="space-y-2">
          {friendRequests.map((requester) => (
            <li
              key={requester}
              className="flex items-center justify-between p-2 bg-zinc-700 rounded"
            >
              <span className="text-gray-200">{requester}</span>
              <button
                onClick={() => handleAcceptRequest(requester)}
                className="px-3 py-1 text-sm text-white bg-blue-500 rounded hover:bg-blue-600 transition-colors"
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
