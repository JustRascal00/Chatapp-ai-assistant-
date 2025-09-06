import google.generativeai as genai

class AIAssistant:
    def __init__(self, api_key):
        genai.configure(api_key=api_key)
        # Use a current, supported model
        # gemini-1.5-flash is fast and suitable for chat and short generations
        try:
            self.model = genai.GenerativeModel('gemini-1.5-flash')
        except Exception:
            # Fallback in case of older API/model availability
            self.model = genai.GenerativeModel('gemini-1.5-pro')

    async def get_response(self, message):
        try:
            response = self.model.generate_content(message)
            return getattr(response, 'text', '')
        except Exception as e:
            # Fallback response on failure
            return "Sorry, I couldn't generate a response right now."

    async def generate_smart_replies(self, context, num_suggestions=2):
        """
        Generate smart reply suggestions based on chat context.
        
        Args:
            context (dict): Contains recent messages, sender, recipient
            num_suggestions (int): Number of reply suggestions to generate
        
        Returns:
            list: Smart reply suggestions
        """
        try:
            # Extract last few messages from context
            last_messages = context.get('messages', [])
            recent_context = " ".join([msg['content'] for msg in last_messages[-2:]])
            
            # Prompt for generating smart replies
            prompt = f"""Generate {num_suggestions} concise, appropriate, and context-aware reply suggestions based on this conversation context:
            
Context: {recent_context}

Please provide short, natural responses that someone might use as a quick reply. Ensure they are:
1. Contextually relevant
2. Polite
3. Brief (under 30 words)
4. Actionable or responsive to the conversation

Format your response as a JSON array of strings."""
            
            response = self.model.generate_content(prompt)
            
            # Parse the response, handling potential JSON parsing issues
            try:
                import json
                suggestions = json.loads(response.text)
                
                # Fallback to text parsing if JSON fails
                if not isinstance(suggestions, list):
                    suggestions = response.text.strip().split('\n')[:num_suggestions]
                
                # Clean and validate suggestions
                suggestions = [
                    suggestion.strip('"') 
                    for suggestion in suggestions 
                    if suggestion.strip() and len(suggestion) <= 50
                ]
                
                return suggestions[:num_suggestions]
            
            except Exception:
                # If parsing fails, generate manual suggestions
                fallback_suggestions = [
                    "Got it, thanks!",
                    "Can you explain more?"
                ]
                return fallback_suggestions

        except Exception as e:
            print(f"Error generating smart replies: {e}")
            return []