import React, { useState } from "react";
import { SmilePlus } from "lucide-react";
import { Button } from "@/app/components/ui/button";
import {
  Popover,
  PopoverContent,
  PopoverTrigger,
} from "@/app/components/ui/popover";

const commonEmojis = ["👍", "❤️", "😊", "😂", "🎉", "👏", "🙌", "🤔"];

const MessageReactions = ({ message, socket, username, selectedFriend }) => {
  const [isOpen, setIsOpen] = useState(false);

  // Helper function to safely get message ID
  const getMessageId = (message) => {
    if (!message) return null;
    // Handle both _id and id properties
    return message._id || message.id || null;
  };

  const handleReaction = (emoji) => {
    // Get message ID safely
    const messageId = getMessageId(message);

    // Debug log to see all values
    console.log("Reaction attempt with values:", {
      messageObject: message,
      messageId,
      username,
      emoji,
      socketState: socket?.readyState,
    });

    // Validate socket first
    if (!socket) {
      console.error("Socket is not initialized");
      return;
    }

    if (socket.readyState !== WebSocket.OPEN) {
      console.error("Socket is not open. Current state:", socket.readyState);
      return;
    }

    // Validate message object
    if (!message) {
      console.error("Message object is undefined");
      return;
    }

    // Validate message ID
    if (!messageId) {
      console.error(
        "Message ID could not be determined from message object:",
        message
      );
      return;
    }

    // Validate username
    if (!username) {
      console.error("Username is missing");
      return;
    }

    // Validate emoji
    if (!emoji) {
      console.error("Emoji is missing");
      return;
    }

    // If we get here, all validations passed
    const reactionData = {
      type: "message_reaction",
      messageId: messageId,
      from: username,
      emoji: emoji,
    };

    console.log("Sending reaction data:", reactionData);

    try {
      socket.send(JSON.stringify(reactionData));
      setIsOpen(false);
    } catch (error) {
      console.error("Error sending reaction:", error);
    }
  };

  // Helper function to safely get reactions
  const getReactions = (message) => {
    if (!message) return [];
    return Array.isArray(message.reactions) ? message.reactions : [];
  };

  // Debug render to see what props we're getting
  console.log("MessageReactions render with props:", {
    messageId: getMessageId(message),
    hasReactions: Boolean(message?.reactions),
    reactionsCount: getReactions(message).length,
    username,
  });

  return (
    <div className="flex items-center space-x-1">
      {getReactions(message).map((reaction, index) => (
        <div
          key={`${reaction.emoji}-${index}`}
          className="inline-flex items-center bg-zinc-700/50 rounded px-1.5 py-0.5 text-xs"
        >
          <span>{reaction.emoji}</span>
          <span className="ml-1 text-zinc-400">
            {reaction.users?.length || reaction.count || 1}
          </span>
        </div>
      ))}

      <Popover open={isOpen} onOpenChange={setIsOpen}>
        <PopoverTrigger asChild>
          <Button
            variant="ghost"
            size="sm"
            className="h-6 w-6 p-0 hover:bg-zinc-700/50"
          >
            <SmilePlus className="h-4 w-4 text-zinc-400" />
          </Button>
        </PopoverTrigger>
        <PopoverContent className="w-auto p-2">
          <div className="flex gap-1">
            {commonEmojis.map((emoji) => (
              <button
                key={emoji}
                onClick={() => handleReaction(emoji)}
                className="hover:bg-zinc-700/50 p-1.5 rounded transition-colors"
              >
                {emoji}
              </button>
            ))}
          </div>
        </PopoverContent>
      </Popover>
    </div>
  );
};

export default MessageReactions;
