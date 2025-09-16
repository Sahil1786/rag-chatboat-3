import React, { useState, useRef, useEffect } from 'react';
import { Button } from '@/components/ui/button';
import { Input } from '@/components/ui/input';
import { Card } from '@/components/ui/card';
import { ScrollArea } from '@/components/ui/scroll-area';
import { Send, RotateCcw, Bot, User } from 'lucide-react';
import { cn } from '@/lib/utils';
import { supabase } from '@/integrations/supabase/client';
import { useToast } from '@/hooks/use-toast';

interface Message {
  id: string;
  text: string;
  sender: 'user' | 'bot';
  timestamp: Date;
  isStreaming?: boolean;
}

export const ChatInterface = () => {
  const [messages, setMessages] = useState<Message[]>([
    {
      id: '1',
      text: 'Hello! I\'m NewsBot, your AI assistant for news and information. I can help you find and understand news articles, answer questions about current events, and provide summaries. What would you like to know?',
      sender: 'bot',
      timestamp: new Date(),
    }
  ]);
  const [inputValue, setInputValue] = useState('');
  const [isLoading, setIsLoading] = useState(false);
  const scrollAreaRef = useRef<HTMLDivElement>(null);
  const messagesEndRef = useRef<HTMLDivElement>(null);

  const scrollToBottom = () => {
    messagesEndRef.current?.scrollIntoView({ behavior: 'smooth' });
  };

  useEffect(() => {
    scrollToBottom();
  }, [messages]);

  const { toast } = useToast();

  const handleSend = async () => {
    if (!inputValue.trim() || isLoading) return;

    const userMessage: Message = {
      id: Date.now().toString(),
      text: inputValue,
      sender: 'user',
      timestamp: new Date(),
    };

    setMessages(prev => [...prev, userMessage]);
    const currentInput = inputValue;
    setInputValue('');
    setIsLoading(true);

    // Create a streaming bot message
    const botMessageId = (Date.now() + 1).toString();
    const initialBotMessage: Message = {
      id: botMessageId,
      text: '',
      sender: 'bot',
      timestamp: new Date(),
      isStreaming: true,
    };
    
    setMessages(prev => [...prev, initialBotMessage]);

    try {
      const response = await fetch(`https://mkrquzrvhuxggxtfxvoo.supabase.co/functions/v1/chat-with-gemini`, {
        method: 'POST',
        headers: {
          'Content-Type': 'application/json',
          'Authorization': `Bearer eyJhbGciOiJIUzI1NiIsInR5cCI6IkpXVCJ9.eyJpc3MiOiJzdXBhYmFzZSIsInJlZiI6Im1rcnF1enJ2aHV4Z2d4dGZ4dm9vIiwicm9sZSI6ImFub24iLCJpYXQiOjE3NTc5NTg3NTcsImV4cCI6MjA3MzUzNDc1N30.OutPyf_u3NJ78VTXZiIRlrGgWPEh4JhsIGG5sjmZ8Zg`,
        },
        body: JSON.stringify({ message: currentInput }),
      });

      if (!response.ok) {
        console.error('Edge function error:', response.status, response.statusText);
        throw new Error(`HTTP error! status: ${response.status}`);
      }

      const reader = response.body?.getReader();
      if (!reader) {
        throw new Error('No response body');
      }

      const decoder = new TextDecoder();
      let accumulatedText = '';

      while (true) {
        const { done, value } = await reader.read();
        if (done) break;

        const chunk = decoder.decode(value, { stream: true });
        const lines = chunk.split('\n');

        for (const line of lines) {
          if (line.startsWith('data: ')) {
            try {
              const data = JSON.parse(line.slice(6));
              console.log('Received data:', data);
              
              if (data.error) {
                console.error('Server error:', data.error);
                throw new Error(data.error);
              }
              
              if (data.text) {
                accumulatedText += data.text;
                setMessages(prev => 
                  prev.map(msg => 
                    msg.id === botMessageId 
                      ? { ...msg, text: accumulatedText }
                      : msg
                  )
                );
              }
              
              if (data.done) {
                setMessages(prev => 
                  prev.map(msg => 
                    msg.id === botMessageId 
                      ? { ...msg, isStreaming: false }
                      : msg
                  )
                );
                break;
              }
            } catch (parseError) {
              console.error('Parse error:', parseError, 'Line:', line);
            }
          }
        }
      }

      // Ensure streaming is marked as complete
      setMessages(prev => 
        prev.map(msg => 
          msg.id === botMessageId 
            ? { ...msg, isStreaming: false, text: accumulatedText || 'Sorry, I could not generate a response.' }
            : msg
        )
      );

    } catch (error) {
      console.error('Error calling chat function:', error);
      toast({
        title: "Error",
        description: "Failed to get response from chatbot. Please try again.",
        variant: "destructive",
      });
      
      // Replace the streaming message with error message
      setMessages(prev => 
        prev.map(msg => 
          msg.id === botMessageId 
            ? { ...msg, text: 'Sorry, I encountered an error. Please try again.', isStreaming: false }
            : msg
        )
      );
    } finally {
      setIsLoading(false);
    }
  };

  const handleReset = () => {
    setMessages([
      {
        id: '1',
        text: 'Session reset! I\'m ready for new questions about news and current events.',
        sender: 'bot',
        timestamp: new Date(),
      }
    ]);
  };

  const handleKeyPress = (e: React.KeyboardEvent) => {
    if (e.key === 'Enter' && !e.shiftKey) {
      e.preventDefault();
      handleSend();
    }
  };

  return (
    <div className="flex flex-col h-full max-h-screen">
      {/* Header */}
      <div className="flex items-center justify-between p-4 border-b bg-card">
        <div className="flex items-center gap-3">
          <div className="p-2 rounded-lg bg-news-primary">
            <Bot className="h-6 w-6 text-white" />
          </div>
          <div>
            <h1 className="text-xl font-semibold">NewsBot</h1>
            <p className="text-sm text-muted-foreground">AI-Powered News Assistant</p>
          </div>
        </div>
        <Button
          variant="outline"
          size="sm"
          onClick={handleReset}
          className="gap-2"
        >
          <RotateCcw className="h-4 w-4" />
          Reset Session
        </Button>
      </div>

      {/* Messages */}
      <ScrollArea ref={scrollAreaRef} className="flex-1 p-4">
        <div className="space-y-4">
          {messages.map((message) => (
            <div
              key={message.id}
              className={cn(
                "flex gap-3 max-w-4xl",
                message.sender === 'user' ? "ml-auto flex-row-reverse" : ""
              )}
            >
              <div className={cn(
                "flex-shrink-0 w-8 h-8 rounded-full flex items-center justify-center",
                message.sender === 'user' 
                  ? "bg-chat-user text-white"
                  : "bg-muted text-muted-foreground"
              )}>
                {message.sender === 'user' ? (
                  <User className="h-4 w-4" />
                ) : (
                  <Bot className="h-4 w-4" />
                )}
              </div>
              <Card className={cn(
                "p-4 max-w-[80%]",
                message.sender === 'user'
                  ? "bg-chat-user text-white border-chat-user"
                  : "bg-chat-bot border-border"
              )}>
                <p className="whitespace-pre-wrap leading-relaxed">
                  {message.text}
                </p>
                <p className={cn(
                  "text-xs mt-2 opacity-70",
                  message.sender === 'user' ? "text-white/70" : "text-muted-foreground"
                )}>
                  {message.timestamp.toLocaleTimeString()}
                </p>
              </Card>
            </div>
          ))}
          {isLoading && (
            <div className="flex gap-3">
              <div className="flex-shrink-0 w-8 h-8 rounded-full bg-muted flex items-center justify-center">
                <Bot className="h-4 w-4 text-muted-foreground" />
              </div>
              <Card className="p-4 bg-chat-bot border-border">
                <div className="flex items-center gap-2">
                  <div className="flex gap-1">
                    <div className="w-2 h-2 bg-muted-foreground rounded-full animate-pulse"></div>
                    <div className="w-2 h-2 bg-muted-foreground rounded-full animate-pulse" style={{animationDelay: '0.2s'}}></div>
                    <div className="w-2 h-2 bg-muted-foreground rounded-full animate-pulse" style={{animationDelay: '0.4s'}}></div>
                  </div>
                  <span className="text-sm text-muted-foreground">Thinking...</span>
                </div>
              </Card>
            </div>
          )}
          <div ref={messagesEndRef} />
        </div>
      </ScrollArea>

      {/* Input */}
      <div className="p-4 border-t bg-card">
        <div className="flex gap-2 max-w-4xl mx-auto">
          <Input
            value={inputValue}
            onChange={(e) => setInputValue(e.target.value)}
            onKeyPress={handleKeyPress}
            placeholder="Ask me about news, current events, or any topic..."
            className="flex-1"
            disabled={isLoading}
          />
          <Button
            onClick={handleSend}
            disabled={!inputValue.trim() || isLoading}
            size="icon"
            className="bg-news-primary hover:bg-news-primary/90"
          >
            <Send className="h-4 w-4" />
          </Button>
        </div>
        <p className="text-xs text-muted-foreground text-center mt-2 max-w-4xl mx-auto">
          Powered by Gemini AI - Ask me anything!
        </p>
      </div>
    </div>
  );
};