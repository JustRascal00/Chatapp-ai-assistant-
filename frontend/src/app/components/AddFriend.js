import { useState } from "react";

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
    <form onSubmit={handleAddFriend} className="mt-4">
      <input
        type="text"
        value={friendName}
        onChange={(e) => setFriendName(e.target.value)}
        className="w-full p-2 mb-2 border rounded bg-zinc-700 text-gray-100 placeholder-gray-400"
        placeholder="Friend's username"
      />
      {error && <p className="text-red-500 text-sm mb-2">{error}</p>}
      <button
        type="submit"
        className="w-full p-2 text-white bg-green-500 rounded hover:bg-green-600"
      >
        Send Friend Request
      </button>
    </form>
  );
}
