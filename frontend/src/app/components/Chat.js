import { useState, useEffect } from "react";

/**
 * @typedef {Object} Message
 * @property {string} type
 * @property {string} from
 * @property {string} to
 * @property {string} content
 */

export default function Chat({ socket, username, selectedFriend }) {
  const [inputMessage, setInputMessage] = useState("");
  const [chatHistory, setChatHistory] = useState({});

  useEffect(() => {
    if (selectedFriend) {
      setChatHistory((prev) => ({
        ...prev,
        [selectedFriend]: prev[selectedFriend] || [],
      }));

      // Ensure the WebSocket exists and is open before sending the load chat history request
      if (socket && socket.readyState === WebSocket.OPEN) {
        socket.send(
          JSON.stringify({
            type: "load_chat_history",
            from: username,
            to: selectedFriend,
          })
        );
      } else if (socket) {
        // Add an event listener to send the request once the socket opens
        const handleOpen = () => {
          socket.send(
            JSON.stringify({
              type: "load_chat_history",
              from: username,
              to: selectedFriend,
            })
          );
        };

        socket.addEventListener("open", handleOpen);

        // Clean up the event listener when the component or socket changes
        return () => {
          socket.removeEventListener("open", handleOpen);
        };
      }
    }
  }, [selectedFriend, socket, username]);

  useEffect(() => {
    if (socket) {
      socket.onmessage = (event) => {
        const data = JSON.parse(event.data);

        if (data.type === "message") {
          const isRelevantMessage =
            (data.from === selectedFriend && data.to === username) ||
            (data.from === username && data.to === selectedFriend);

          if (isRelevantMessage) {
            setChatHistory((prev) => ({
              ...prev,
              [selectedFriend]: [...(prev[selectedFriend] || []), data],
            }));
          }
        } else if (data.type === "chat_history" && data.chat) {
          setChatHistory((prev) => ({
            ...prev,
            [selectedFriend]: data.chat,
          }));
        }
      };
    }
  }, [socket, selectedFriend, username]);

  const sendMessage = (e) => {
    e.preventDefault();
    if (inputMessage.trim() && socket && socket.readyState === WebSocket.OPEN) {
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
      <div className="mb-4 p-4 bg-zinc-800 rounded-lg shadow">
        <h2 className="text-xl font-bold text-gray-300">
          Chat with {selectedFriend}
        </h2>
      </div>

      <div className="flex-1 overflow-y-auto p-4 space-y-4 bg-zinc-800 rounded-lg shadow-inner">
        {chatHistory[selectedFriend]?.map((msg, index) => (
          <div
            key={index}
            className={`p-2 rounded max-w-[80%] ${
              msg.from === username
                ? "bg-blue-600 text-white ml-auto"
                : "bg-zinc-700 text-gray-200"
            }`}
          >
            <p className="text-sm opacity-75 mb-1">{msg.from}</p>
            <p className="break-words">{msg.content}</p>
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
