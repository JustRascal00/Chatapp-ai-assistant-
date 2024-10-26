"use client";

import { useState, useEffect } from "react";
import Chat from "./components/Chat";
import FriendList from "./components/FriendList";
import AddFriend from "./components/AddFriend";
import FriendRequests from "./components/FriendRequests";

export default function Component() {
  const [username, setUsername] = useState("");
  const [isLoggedIn, setIsLoggedIn] = useState(false);
  const [socket, setSocket] = useState(null);
  const [selectedFriend, setSelectedFriend] = useState("AI Assistant");

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
      <div className="flex items-center justify-center min-h-screen bg-zinc-900 text-gray-100">
        <form
          onSubmit={handleLogin}
          className="p-6 bg-zinc-800 rounded shadow-md"
        >
          <input
            type="text"
            value={username}
            onChange={(e) => setUsername(e.target.value)}
            placeholder="Enter your username"
            className="w-full p-2 mb-4 border rounded bg-zinc-700 text-gray-100 placeholder-gray-400"
          />
          <button
            type="submit"
            className="w-full p-2 text-white bg-blue-600 rounded hover:bg-blue-700 transition-colors"
          >
            Login
          </button>
        </form>
      </div>
    );
  }

  return (
    <div className="flex h-screen bg-zinc-900 text-gray-100">
      <div className="w-1/4 p-4 bg-zinc-800 border-r border-zinc-700">
        <h2 className="mb-4 text-xl font-bold text-gray-300">Friends</h2>
        <FriendList
          socket={socket}
          username={username}
          onSelectFriend={setSelectedFriend}
        />
        <AddFriend socket={socket} username={username} />
        <FriendRequests socket={socket} username={username} />
      </div>
      <div className="w-3/4 p-4 bg-zinc-900">
        <Chat
          socket={socket}
          username={username}
          selectedFriend={selectedFriend}
        />
      </div>
    </div>
  );
}
