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
  const pendingReactionsRef = useRef(new Map());
  const messageIdRef = useRef(null);
  const lastUpdateRef = useRef(null);

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
  const handleWebSocketMessage = useCallback(
    (event) => {
      try {
        const data = JSON.parse(event.data);

        if (
          data.type === "reaction_update" &&
          data.messageId &&
          data.reactions
        ) {
          if (data.messageId === messageIdRef.current) {
            const currentTime = Date.now();

            // Check if this update is newer than our last local update
            if (!lastUpdateRef.current || currentTime > lastUpdateRef.current) {
              console.log("Applying server reaction update:", {
                messageId: data.messageId,
                reactions: data.reactions,
              });

              // Clear any pending reactions that were included in this update
              const pendingReactions = pendingReactionsRef.current;
              data.reactions.forEach((reaction) => {
                if (reaction.users.includes(username)) {
                  pendingReactions.delete(
                    `${data.messageId}-${reaction.emoji}`
                  );
                }
              });

              setLocalReactions((prevReactions) => {
                // Merge pending reactions with server update
                const mergedReactions = [...data.reactions];
                pendingReactions.forEach((pendingReaction, key) => {
                  const [messageId, emoji] = key.split("-");
                  if (messageId === data.messageId) {
                    const existingIndex = mergedReactions.findIndex(
                      (r) => r.emoji === emoji
                    );
                    if (existingIndex === -1) {
                      mergedReactions.push({
                        emoji,
                        count: 1,
                        users: [username],
                      });
                    } else if (
                      !mergedReactions[existingIndex].users.includes(username)
                    ) {
                      mergedReactions[existingIndex] = {
                        ...mergedReactions[existingIndex],
                        count: mergedReactions[existingIndex].count + 1,
                        users: [
                          ...mergedReactions[existingIndex].users,
                          username,
                        ],
                      };
                    }
                  }
                });
                return mergedReactions;
              });
            }
          }
        }
      } catch (error) {
        console.error("Error processing reaction update:", error);
      }
    },
    [username]
  );

  // WebSocket event listener setup
  useEffect(() => {
    if (!socket) return;
    socket.addEventListener("message", handleWebSocketMessage);
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
        // Create reaction key
        const reactionKey = `${messageId}-${emoji}`;
        const currentTime = Date.now();

        // Store pending reaction
        pendingReactionsRef.current.set(reactionKey, {
          timestamp: currentTime,
          emoji,
        });

        // Update last update timestamp
        lastUpdateRef.current = currentTime;

        // Prepare reaction data
        const reactionData = {
          type: "message_reaction",
          messageId,
          from: username,
          emoji,
        };

        // Send to server
        console.log("Sending reaction:", reactionData);
        socket.send(JSON.stringify(reactionData));

        // Optimistic update
        setLocalReactions((prevReactions) => {
          const updatedReactions = [...prevReactions];
          const existingIndex = updatedReactions.findIndex(
            (r) => r.emoji === emoji
          );

          if (existingIndex !== -1) {
            if (!updatedReactions[existingIndex].users.includes(username)) {
              updatedReactions[existingIndex] = {
                ...updatedReactions[existingIndex],
                count: updatedReactions[existingIndex].count + 1,
                users: [...updatedReactions[existingIndex].users, username],
              };
            }
          } else {
            updatedReactions.push({
              emoji,
              count: 1,
              users: [username],
            });
          }

          return updatedReactions;
        });

        // Cleanup timeout
        setTimeout(() => {
          const pendingReaction = pendingReactionsRef.current.get(reactionKey);
          if (pendingReaction && pendingReaction.timestamp === currentTime) {
            console.warn("Reaction timeout - no server response");
            pendingReactionsRef.current.delete(reactionKey);
          }
        }, 5000);

        setIsOpen(false);
      } catch (error) {
        console.error("Error handling reaction:", error);
      }
    },
    [message, getMessageId, canUserReact, socket, username]
  );

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
