import { useState, useEffect } from "react";

/**
 * @typedef {Object} Message
 * @property {string} type
 * @property {string} from
 * @property {string} to
 * @property {string} content
 */

export default function Component({ socket, username, selectedFriend }) {
  const [messages, setMessages] = useState([]);
  const [inputMessage, setInputMessage] = useState("");

  useEffect(() => {
    if (socket) {
      socket.onmessage = (event) => {
        const data = JSON.parse(event.data);
        if (
          data.type === "message" &&
          (data.from === selectedFriend || data.to === selectedFriend)
        ) {
          setMessages((prevMessages) => [...prevMessages, data]);
        }
      };
    }
  }, [socket, selectedFriend]);

  const sendMessage = (e) => {
    e.preventDefault();
    if (inputMessage.trim() && socket) {
      const messageData = {
        type: "message",
        from: username,
        to: selectedFriend,
        content: inputMessage,
      };
      socket.send(JSON.stringify(messageData));
      setInputMessage("");
    }
  };

  return (
    <div className="flex flex-col h-full">
      <h2 className="text-xl font-bold mb-4 text-gray-300">
        Chat with {selectedFriend}
      </h2>
      <div className="flex-1 overflow-y-auto p-4 space-y-4 bg-zinc-800 rounded-lg shadow-inner">
        {messages.map((msg, index) => (
          <div
            key={index}
            className={`p-2 rounded ${
              msg.from === username
                ? "bg-blue-600 text-white self-end"
                : "bg-zinc-700 text-gray-200 self-start"
            }`}
          >
            <p className="font-bold">{msg.from}</p>
            <p>{msg.content}</p>
          </div>
        ))}
      </div>
      <form onSubmit={sendMessage} className="flex mt-4">
        <input
          type="text"
          value={inputMessage}
          onChange={(e) => setInputMessage(e.target.value)}
          className="flex-1 p-2 border rounded-l bg-zinc-800 text-gray-100 placeholder-gray-400"
          placeholder="Type a message..."
        />
        <button
          type="submit"
          className="p-2 text-white bg-blue-600 rounded-r hover:bg-blue-700 transition-colors"
        >
          Send
        </button>
      </form>
    </div>
  );
}
