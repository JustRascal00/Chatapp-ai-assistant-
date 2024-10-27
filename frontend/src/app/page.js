"use client";

import { useState, useEffect } from "react";
import { motion } from "framer-motion";
import { Loader2 } from "lucide-react";
import { Button } from "@/app/components/ui/button";
import { Input } from "@/app/components/ui/input";

// Assume these components have been updated with the new styling
import Chat from "./components/Chat";
import FriendList from "./components/FriendList";
import AddFriend from "./components/AddFriend";
import FriendRequests from "./components/FriendRequests";

export default function Component() {
  const [username, setUsername] = useState("");
  const [isLoggedIn, setIsLoggedIn] = useState(false);
  const [socket, setSocket] = useState(null);
  const [selectedFriend, setSelectedFriend] = useState("AI Assistant");
  const [isLoading, setIsLoading] = useState(false);

  useEffect(() => {
    if (isLoggedIn) {
      setIsLoading(true);
      const ws = new WebSocket("ws://localhost:8765");
      setSocket(ws);

      ws.onopen = () => {
        ws.send(JSON.stringify({ type: "register", username }));
        setIsLoading(false);
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
      <div className="flex items-center justify-center min-h-screen bg-gradient-to-br from-zinc-900 to-black text-gray-100">
        <motion.div
          initial={{ opacity: 0, y: -20 }}
          animate={{ opacity: 1, y: 0 }}
          transition={{ duration: 0.5 }}
          className="w-full max-w-md"
        >
          <form
            onSubmit={handleLogin}
            className="p-8 bg-zinc-800 rounded-lg shadow-xl"
          >
            <h1 className="text-3xl font-bold mb-6 text-center text-gray-100">
              Welcome to ChatApp
            </h1>
            <Input
              type="text"
              value={username}
              onChange={(e) => setUsername(e.target.value)}
              placeholder="Enter your username"
              className="w-full p-3 mb-4 bg-zinc-700 text-gray-100 placeholder-gray-400 rounded-md focus:ring-2 focus:ring-blue-500 focus:border-transparent"
            />
            <Button
              type="submit"
              className="w-full p-3 text-white bg-blue-600 rounded-md hover:bg-blue-700 transition-colors focus:outline-none focus:ring-2 focus:ring-blue-500 focus:ring-opacity-50"
            >
              Login
            </Button>
          </form>
        </motion.div>
      </div>
    );
  }

  return (
    <div className="flex h-screen bg-gradient-to-br from-zinc-900 to-black text-gray-100">
      {isLoading ? (
        <div className="flex items-center justify-center w-full">
          <Loader2 className="w-8 h-8 animate-spin text-blue-500" />
        </div>
      ) : (
        <>
          <motion.div
            initial={{ opacity: 0, x: -20 }}
            animate={{ opacity: 1, x: 0 }}
            transition={{ duration: 0.5 }}
            className="w-1/4 p-6 bg-zinc-800 border-r border-zinc-700 overflow-y-auto"
          >
            <h2 className="mb-6 text-2xl font-bold text-gray-100">Friends</h2>
            <FriendList
              socket={socket}
              username={username}
              onSelectFriend={setSelectedFriend}
            />
            <AddFriend socket={socket} username={username} />
            <FriendRequests socket={socket} username={username} />
          </motion.div>
          <motion.div
            initial={{ opacity: 0, x: 20 }}
            animate={{ opacity: 1, x: 0 }}
            transition={{ duration: 0.5 }}
            className="w-3/4 p-6 bg-zinc-900"
          >
            <Chat
              socket={socket}
              username={username}
              selectedFriend={selectedFriend}
            />
          </motion.div>
        </>
      )}
    </div>
  );
}
