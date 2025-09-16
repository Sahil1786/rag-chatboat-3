import "https://deno.land/x/xhr@0.1.0/mod.ts";
import { serve } from "https://deno.land/std@0.168.0/http/server.ts";

const corsHeaders = {
  'Access-Control-Allow-Origin': '*',
  'Access-Control-Allow-Headers': 'authorization, x-client-info, apikey, content-type',
};

serve(async (req) => {
  // Handle CORS preflight requests
  if (req.method === 'OPTIONS') {
    return new Response(null, { headers: corsHeaders });
  }

  try {
    const { message } = await req.json();
    const geminiApiKey = Deno.env.get('GEMINI_API_KEY');

    if (!geminiApiKey) {
      throw new Error('Gemini API key not configured');
    }

    console.log('Processing chat message:', message);

    // Create a ReadableStream for streaming response
    const stream = new ReadableStream({
      async start(controller) {
        try {
          // Call Gemini API with streaming enabled
          const response = await fetch(`https://generativelanguage.googleapis.com/v1beta/models/gemini-1.5-flash:streamGenerateContent?key=${geminiApiKey}`, {
            method: 'POST',
            headers: {
              'Content-Type': 'application/json',
            },
            body: JSON.stringify({
              contents: [{
                parts: [{
                  text: `You are a helpful RAG-powered chatbot. Provide informative and accurate responses based on the user's question: ${message}`
                }]
              }],
              generationConfig: {
                temperature: 0.7,
                topK: 40,
                topP: 0.95,
                maxOutputTokens: 1024,
              }
            }),
          });

          if (!response.ok) {
            const errorData = await response.text();
            console.error('Gemini API error:', errorData);
            controller.enqueue(`data: ${JSON.stringify({ error: `Gemini API error: ${response.status}` })}\n\n`);
            controller.close();
            return;
          }

          const reader = response.body?.getReader();
          if (!reader) {
            controller.enqueue(`data: ${JSON.stringify({ error: 'No response body' })}\n\n`);
            controller.close();
            return;
          }

          const decoder = new TextDecoder();
          let buffer = '';

          try {
            while (true) {
              const { done, value } = await reader.read();
              if (done) break;

              buffer += decoder.decode(value, { stream: true });
              const lines = buffer.split('\n');
              buffer = lines.pop() || '';

              for (const line of lines) {
                if (line.trim() && line.startsWith('data: ')) {
                  try {
                    const jsonStr = line.slice(6);
                    if (jsonStr === '[DONE]') {
                      controller.enqueue(`data: ${JSON.stringify({ done: true })}\n\n`);
                      continue;
                    }
                    
                    const parsed = JSON.parse(jsonStr);
                    const text = parsed.candidates?.[0]?.content?.parts?.[0]?.text;
                    
                    if (text) {
                      controller.enqueue(`data: ${JSON.stringify({ text })}\n\n`);
                    }
                  } catch (parseError) {
                    console.error('Parse error:', parseError);
                  }
                }
              }
            }
          } catch (readError) {
            console.error('Stream read error:', readError);
            controller.enqueue(`data: ${JSON.stringify({ error: 'Stream read error' })}\n\n`);
          } finally {
            controller.enqueue(`data: ${JSON.stringify({ done: true })}\n\n`);
            controller.close();
          }
        } catch (error) {
          console.error('Stream start error:', error);
          controller.enqueue(`data: ${JSON.stringify({ error: error.message })}\n\n`);
          controller.close();
        }
      }
    });

    return new Response(stream, {
      headers: {
        ...corsHeaders,
        'Content-Type': 'text/event-stream',
        'Cache-Control': 'no-cache',
        'Connection': 'keep-alive',
      },
    });
    
  } catch (error) {
    console.error('Error in chat-with-gemini function:', error);
    return new Response(JSON.stringify({ 
      error: 'Failed to process chat message',
      details: error.message 
    }), {
      status: 500,
      headers: { ...corsHeaders, 'Content-Type': 'application/json' },
    });
  }
});