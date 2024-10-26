"use client";

import { useState, useEffect } from "react";
import Chat from "@/app/components/Chat";
import FriendList from "@/app/components/FriendList";
import AddFriend from "@/app/components/AddFriend";

export default function Home() {
  const [username, setUsername] = useState("");
  const [isLoggedIn, setIsLoggedIn] = useState(false);
  const [socket, setSocket] = useState(null);

  useEffect(() => {
    if (isLoggedIn) {
      const ws = new WebSocket("ws://localhost:8765");
      setSocket(ws);

      ws.onopen = () => {
        ws.send(JSON.stringify({ type: "register", username }));
      };

      return () => {
        ws.close();
      };
    }
  }, [isLoggedIn, username]);

  const handleLogin = (e) => {
    e.preventDefault();
    setIsLoggedIn(true);
  };

  if (!isLoggedIn) {
    return (
      <div className="flex items-center justify-center min-h-screen bg-gray-100">
        <form onSubmit={handleLogin} className="p-6 bg-white rounded shadow-md">
          <input
            type="text"
            value={username}
            onChange={(e) => setUsername(e.target.value)}
            placeholder="Enter your username"
            className="w-full p-2 mb-4 border rounded"
          />
          <button
            type="submit"
            className="w-full p-2 text-white bg-blue-500 rounded hover:bg-blue-600"
          >
            Login
          </button>
        </form>
      </div>
    );
  }

  return (
    <div className="flex h-screen bg-gray-100">
      <div className="w-1/4 p-4 bg-white border-r">
        <h2 className="mb-4 text-xl font-bold">Friends</h2>
        <FriendList socket={socket} />
        <AddFriend socket={socket} />
      </div>
      <div className="w-3/4 p-4">
        <Chat socket={socket} username={username} />
      </div>
    </div>
  );
}
