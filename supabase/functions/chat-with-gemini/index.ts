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
        console.error('Gemini API key not configured');
        return new Response(JSON.stringify({ 
          error: 'Gemini API key not configured. Please add GEMINI_API_KEY to your Supabase secrets.' 
        }), {
          status: 500,
          headers: { ...corsHeaders, 'Content-Type': 'application/json' },
        });
      }

      console.log('Processing chat message:', message);

    // Create a ReadableStream for streaming response
    const stream = new ReadableStream({
      async start(controller) {
        try {
          // Call Gemini API with streaming enabled
          console.log('Calling Gemini API...');
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
          
          console.log('Gemini API response status:', response.status);

          if (!response.ok) {
            const errorData = await response.text();
            console.error('Gemini API error:', response.status, errorData);
            controller.enqueue(`data: ${JSON.stringify({ error: `Gemini API error: ${response.status} - ${errorData}` })}\n\n`);
            controller.close();
            return;
          }

          // Check if the response is streaming or not
          const contentType = response.headers.get('content-type');
          const isStreaming = contentType?.includes('text/plain') || contentType?.includes('text/event-stream');

          if (!isStreaming) {
            // Handle non-streaming response
            const data = await response.json();
            console.log('Non-streaming response:', JSON.stringify(data));
            const text = data.candidates?.[0]?.content?.parts?.[0]?.text;
            
            if (text) {
              console.log('Sending non-streaming text:', text);
              controller.enqueue(`data: ${JSON.stringify({ text })}\n\n`);
            }
            controller.enqueue(`data: ${JSON.stringify({ done: true })}\n\n`);
            controller.close();
            return;
          }

          // Handle streaming response
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
                if (line.trim()) {
                  console.log('Processing streaming line:', line);
                  
                  // Try to parse as JSON directly (Gemini's format)
                  try {
                    const parsed = JSON.parse(line);
                    const text = parsed.candidates?.[0]?.content?.parts?.[0]?.text;
                    
                    if (text) {
                      console.log('Sending streaming text:', text);
                      controller.enqueue(`data: ${JSON.stringify({ text })}\n\n`);
                    }
                    
                    // Check if this is the final chunk
                    if (parsed.candidates?.[0]?.finishReason === 'STOP') {
                      controller.enqueue(`data: ${JSON.stringify({ done: true })}\n\n`);
                      break;
                    }
                  } catch (parseError) {
                    console.log('Skipping non-JSON line:', line);
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