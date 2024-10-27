import { useState } from "react";
import { UserPlus } from "lucide-react";
import { Button } from "@/app/components/ui/button";
import { Input } from "@/app/components/ui/input";

export default function Component({ socket, username }) {
  const [friendName, setFriendName] = useState("");
  const [error, setError] = useState("");

  const handleAddFriend = (e) => {
    e.preventDefault();
    if (friendName.trim() && socket) {
      if (friendName === username) {
        setError("You cannot add yourself as a friend");
        return;
      }
      socket.send(
        JSON.stringify({
          type: "add_friend",
          from: username,
          to: friendName.trim(),
        })
      );
      setFriendName("");
      setError("");
    }
  };

  return (
    <form onSubmit={handleAddFriend} className="mt-6 space-y-4">
      <Input
        type="text"
        value={friendName}
        onChange={(e) => setFriendName(e.target.value)}
        className="w-full p-3 bg-zinc-700 text-gray-100 placeholder-gray-400 rounded-md"
        placeholder="Friend's username"
      />
      {error && <p className="text-sm text-red-500 mt-2">{error}</p>}
      <Button
        type="submit"
        className="w-full p-3 bg-blue-600 text-white rounded-md hover:bg-blue-700 transition-colors flex items-center justify-center space-x-2"
      >
        <UserPlus className="h-5 w-5" />
        <span>Send Friend Request</span>
      </Button>
    </form>
  );
}
