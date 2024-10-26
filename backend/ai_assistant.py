import google.generativeai as genai

class AIAssistant:
    def __init__(self, api_key):
        genai.configure(api_key=api_key)
        self.model = genai.GenerativeModel('gemini-pro')

    async def get_response(self, message):
        response = self.model.generate_content(message)
        return response.text