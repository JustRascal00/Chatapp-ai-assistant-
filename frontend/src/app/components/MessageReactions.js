import React, { useState, useEffect, useCallback, useRef } from "react";
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
  const [localReactions, setLocalReactions] = useState([]);
  const pendingReactionsRef = useRef(new Set());
  const messageIdRef = useRef(null);

  // Helper function to safely get reactions
  const getReactions = useCallback((msg) => {
    if (!msg) return [];
    return Array.isArray(msg.reactions) ? msg.reactions : [];
  }, []);

  // Helper function to safely get message ID
  const getMessageId = useCallback((msg) => {
    if (!msg || !msg._id) return null;
    return typeof msg._id === "string" ? msg._id : String(msg._id);
  }, []);

  // Initialize local reactions and messageId whenever message changes
  useEffect(() => {
    const initialReactions = getReactions(message);
    setLocalReactions(initialReactions);
    messageIdRef.current = getMessageId(message);
  }, [message, getReactions, getMessageId]);

  // Process reaction updates from WebSocket
  const handleWebSocketMessage = useCallback((event) => {
    try {
      const data = JSON.parse(event.data);

      if (data.type === "reaction_update" && data.messageId && data.reactions) {
        // Compare with stored messageId instead of getting it from message prop
        if (data.messageId === messageIdRef.current) {
          console.log("Processing reaction update:", {
            messageId: data.messageId,
            reactions: data.reactions,
          });

          // Clear any pending reactions for this update
          pendingReactionsRef.current.clear();

          // Update with server-provided reactions
          setLocalReactions(data.reactions);
          console.log("Updated local reactions:", data.reactions);
        }
      }
    } catch (error) {
      console.error("Error processing reaction update:", error);
    }
  }, []); // Ensure dependencies are correct

  // WebSocket event listener setup
  useEffect(() => {
    if (!socket) return;

    // Add event listener
    socket.addEventListener("message", handleWebSocketMessage);

    // Cleanup
    return () => {
      socket.removeEventListener("message", handleWebSocketMessage);
    };
  }, [socket, handleWebSocketMessage]);

  // Permission check for reactions
  const canUserReact = useCallback(() => {
    if (!message) return false;
    if (message.from === "AI Assistant" || message.to === "AI Assistant")
      return true;
    return message.from !== username;
  }, [message, username]);

  // Handle reaction click with optimistic updates
  const handleReaction = useCallback(
    (emoji) => {
      if (!message || !canUserReact()) {
        console.warn("Cannot react to this message");
        return;
      }

      const messageId = getMessageId(message);
      if (!messageId || !socket || socket.readyState !== WebSocket.OPEN) {
        console.error("Cannot send reaction: invalid state");
        return;
      }

      try {
        // Create unique key for this reaction
        const reactionKey = `${messageId}-${emoji}-${username}-${Date.now()}`;
        pendingReactionsRef.current.add(reactionKey);

        // Prepare reaction data
        const reactionData = {
          type: "message_reaction",
          messageId,
          from: username,
          emoji,
        };

        // Send to server first
        console.log("Sending reaction:", reactionData);
        socket.send(JSON.stringify(reactionData));

        // Optimistically update local state
        setLocalReactions((prevReactions) => {
          // Check if user already reacted with this emoji
          const existingReaction = prevReactions.find(
            (r) => r.emoji === emoji && r.users?.includes(username)
          );

          if (existingReaction) {
            return prevReactions;
          }

          // Find if emoji already exists but user hasn't reacted
          const existingEmojiReaction = prevReactions.find(
            (r) => r.emoji === emoji
          );

          if (existingEmojiReaction) {
            return prevReactions.map((r) => {
              if (r.emoji === emoji) {
                return {
                  ...r,
                  count: (r.count || 1) + 1,
                  users: [...(r.users || []), username],
                };
              }
              return r;
            });
          }

          // Add new reaction
          return [
            ...prevReactions,
            {
              emoji,
              count: 1,
              users: [username],
            },
          ];
        });

        // Set timeout to revert if no server response
        setTimeout(() => {
          if (pendingReactionsRef.current.has(reactionKey)) {
            pendingReactionsRef.current.delete(reactionKey);
            console.log("Reaction timeout - no server response");
            // Could add logic here to revert the optimistic update
          }
        }, 5000);

        setIsOpen(false);
      } catch (error) {
        console.error("Error handling reaction:", error);
      }
    },
    [message, getMessageId, canUserReact, socket, username]
  );

  // Render nothing if message is invalid
  if (!message || !getMessageId(message)) return null;

  return (
    <div className="flex items-center space-x-1">
      {localReactions.map((reaction, index) => (
        <div
          key={`${reaction.emoji}-${index}`}
          className="inline-flex items-center bg-zinc-700/50 rounded px-1.5 py-0.5 text-xs hover:bg-zinc-700/70 transition-colors cursor-default"
          title={reaction.users?.join(", ") || "Loading..."}
        >
          <span>{reaction.emoji}</span>
          <span className="ml-1 text-zinc-400">
            {reaction.users?.length || reaction.count || 1}
          </span>
        </div>
      ))}

      {canUserReact() && (
        <Popover open={isOpen} onOpenChange={setIsOpen}>
          <PopoverTrigger asChild>
            <Button
              variant="ghost"
              size="sm"
              className="h-6 w-6 p-0 hover:bg-zinc-700/50 transition-colors"
              aria-label="Add reaction"
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
                  aria-label={`React with ${emoji}`}
                >
                  {emoji}
                </button>
              ))}
            </div>
          </PopoverContent>
        </Popover>
      )}
    </div>
  );
};

export default MessageReactions;
