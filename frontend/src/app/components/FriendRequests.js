import { useState, useEffect } from "react";
import { motion, AnimatePresence } from "framer-motion";
import { UserCheck, Bell } from "lucide-react";
import { Button } from "@/app/components/ui/button";

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
    <motion.div
      initial={{ opacity: 0, y: 20 }}
      animate={{ opacity: 1, y: 0 }}
      transition={{ duration: 0.5 }}
      className="mt-6"
    >
      <h3 className="text-lg font-semibold mb-4 text-gray-200 flex items-center space-x-2">
        <Bell className="h-5 w-5" />
        <span>Friend Requests ({friendRequests.length})</span>
      </h3>
      {notification && (
        <motion.div
          initial={{ opacity: 0, y: -10 }}
          animate={{ opacity: 1, y: 0 }}
          exit={{ opacity: 0, y: -10 }}
          className="mb-4 p-2 bg-blue-500 text-white rounded-md"
        >
          {notification}
        </motion.div>
      )}
      <AnimatePresence>
        {friendRequests.length === 0 ? (
          <motion.p
            initial={{ opacity: 0 }}
            animate={{ opacity: 1 }}
            exit={{ opacity: 0 }}
            className="text-gray-400"
          >
            No pending friend requests
          </motion.p>
        ) : (
          <ul className="space-y-2">
            {friendRequests.map((requester) => (
              <motion.li
                key={requester}
                initial={{ opacity: 0, y: -10 }}
                animate={{ opacity: 1, y: 0 }}
                exit={{ opacity: 0, y: -10 }}
                className="flex items-center justify-between p-3 bg-zinc-700 rounded-lg"
              >
                <span className="text-gray-200">{requester}</span>
                <Button
                  onClick={() => handleAcceptRequest(requester)}
                  className="px-3 py-1 text-sm text-white bg-blue-600 rounded-md hover:bg-blue-700 transition-colors flex items-center space-x-1"
                >
                  <UserCheck className="h-4 w-4" />
                  <span>Accept</span>
                </Button>
              </motion.li>
            ))}
          </ul>
        )}
      </AnimatePresence>
    </motion.div>
  );
}
