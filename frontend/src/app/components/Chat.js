import { useState, useEffect } from "react";

export default function Chat({ socket, username }) {
  const [messages, setMessages] = useState([]);
  const [inputMessage, setInputMessage] = useState("");
  const [selectedFriend, setSelectedFriend] = useState("AI Assistant");

  useEffect(() => {
    if (socket) {
      socket.onmessage = (event) => {
        const data = JSON.parse(event.data);
        if (data.type === "message") {
          setMessages((prevMessages) => [...prevMessages, data]);
        }
      };
    }
  }, [socket]);

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
      <div className="flex-1 overflow-y-auto p-4 space-y-4">
        {messages.map((msg, index) => (
          <div
            key={index}
            className={`p-2 rounded ${
              msg.from === username
                ? "bg-blue-500 text-white self-end"
                : "bg-gray-200 self-start"
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
          className="flex-1 p-2 border rounded-l"
          placeholder="Type a message..."
        />
        <button
          type="submit"
          className="p-2 text-white bg-blue-500 rounded-r hover:bg-blue-600"
        >
          Send
        </button>
      </form>
    </div>
  );
}
