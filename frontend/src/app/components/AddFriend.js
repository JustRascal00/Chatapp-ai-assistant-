import { useState } from "react";

export default function Component({ socket, username }) {
  const [friendName, setFriendName] = useState("");

  const handleAddFriend = (e) => {
    e.preventDefault();
    if (friendName.trim() && socket) {
      socket.send(
        JSON.stringify({ type: "add_friend", from: username, to: friendName })
      );
      setFriendName("");
    }
  };

  return (
    <form onSubmit={handleAddFriend} className="mt-4">
      <input
        type="text"
        value={friendName}
        onChange={(e) => setFriendName(e.target.value)}
        className="w-full p-2 mb-2 border rounded"
        placeholder="Friend's username"
      />
      <button
        type="submit"
        className="w-full p-2 text-white bg-green-500 rounded hover:bg-green-600"
      >
        Send Friend Request
      </button>
    </form>
  );
}
