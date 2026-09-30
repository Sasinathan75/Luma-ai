import { useAuth } from "@/_core/hooks/useAuth";
import { startLogin } from "@/const";
import { trpc } from "@/lib/trpc";
import { Streamdown } from "streamdown";
import {
  Archive,
  ArrowUp,
  Bot,
  Check,
  Clipboard,
  Clock3,
  FileText,
  Headphones,
  Image as ImageIcon,
  Lightbulb,
  Menu,
  Mic,
  MicOff,
  MoreHorizontal,
  Paperclip,
  PanelLeftClose,
  PanelLeftOpen,
  Plus,
  RotateCcw,
  Search,
  Send,
  Settings2,
  Square,
  Sparkles,
  StopCircle,
  ThumbsDown,
  ThumbsUp,
  Trash2,
  UploadCloud,
  UserRound,
  Volume2,
  X,
  Zap,
} from "lucide-react";
import { useEffect, useMemo, useRef, useState } from "react";
import { toast } from "sonner";
import { cn } from "@/lib/utils";

type Intent = "general" | "architecture" | "image" | "document" | "voice";
type Attachment = { fileName: string; mimeType: string; kind: "image" | "document"; url?: string; preview?: string };
type ChatMessage = { id: string; role: "user" | "assistant"; content: string; attachment?: Attachment; demo?: boolean };
type ConversationRow = { id: string; title: string; updatedAt?: string | Date; isGuest?: boolean };

type SpeechRecognitionLike = {
  lang: string;
  interimResults: boolean;
  continuous: boolean;
  onresult: ((event: { results: ArrayLike<{ 0: { transcript: string } }> }) => void) | null;
  onend: (() => void) | null;
  onerror: (() => void) | null;
  start: () => void;
  stop: () => void;
};
type SpeechRecognitionConstructor = new () => SpeechRecognitionLike;

type WindowWithSpeech = Window & { SpeechRecognition?: SpeechRecognitionConstructor; webkitSpeechRecognition?: SpeechRecognitionConstructor };

const LOCAL_CONVERSATIONS = "luma-conversations";
const LOCAL_MESSAGES = "luma-messages";
const MAX_FILE_BYTES = 10 * 1024 * 1024;

const quickActions: Array<{ label: string; description: string; intent: Intent; icon: typeof Sparkles; tint: string }> = [
  { label: "Ask anything", description: "Learn, write, plan", intent: "general", icon: Sparkles, tint: "bg-[#e9e4ff] text-[#6c5ce7]" },
  { label: "Voice chat", description: "Talk it through", intent: "voice", icon: Mic, tint: "bg-[#def5ed] text-[#39836c]" },
  { label: "Analyze image", description: "See what I see", intent: "image", icon: ImageIcon, tint: "bg-[#ffe7d8] text-[#c66d43]" },
  { label: "Analyze document", description: "Summarize & ask", intent: "document", icon: FileText, tint: "bg-[#e4efff] text-[#4c78ba]" },
  { label: "Architecture assistant", description: "Plan with depth", intent: "architecture", icon: Lightbulb, tint: "bg-[#f6e5b9] text-[#9b7824]" },
];

const makeGuestId = () => `guest-${Date.now()}`;
const getLocalRows = (): ConversationRow[] => {
  try { return JSON.parse(localStorage.getItem(LOCAL_CONVERSATIONS) ?? "[]"); } catch { return []; }
};
const getLocalMessages = (): Record<string, ChatMessage[]> => {
  try { return JSON.parse(localStorage.getItem(LOCAL_MESSAGES) ?? "{}"); } catch { return {}; }
};
const fileToDataUri = (file: File) => new Promise<string>((resolve, reject) => {
  const reader = new FileReader();
  reader.onload = () => resolve(String(reader.result));
  reader.onerror = () => reject(new Error("Could not read this file."));
  reader.readAsDataURL(file);
});
const formatTime = (value?: string | Date) => value ? new Date(value).toLocaleDateString(undefined, { month: "short", day: "numeric" }) : "Just now";

function Logo({ compact = false }: { compact?: boolean }) {
  return <div className="flex items-center gap-2.5">
    <div className="relative grid size-9 place-items-center rounded-[13px] bg-[#201e29] text-white shadow-[0_8px_22px_rgba(32,30,41,.18)]">
      <span className="absolute h-4 w-4 rotate-45 rounded-[4px] bg-[#b7f1d9]" />
      <span className="relative h-2.5 w-2.5 rounded-full bg-[#6c5ce7]" />
    </div>
    {!compact && <div><div className="font-display text-[17px] font-semibold tracking-[-.03em]">luma</div><div className="font-mono text-[9px] uppercase tracking-[.2em] text-muted-foreground">multimodal intelligence</div></div>}
  </div>;
}

function GeometricField({ small = false }: { small?: boolean }) {
  return <div aria-hidden="true" className={cn("pointer-events-none absolute inset-0 overflow-hidden", small ? "opacity-70" : "opacity-100")}>
    <div className="absolute -left-20 top-10 size-[310px] rotate-[16deg] rounded-[35%] bg-[#d8d0ff] blur-[1px]" style={{ animation: "drift 9s ease-in-out infinite" }} />
    <div className="absolute left-[28%] top-[18%] size-[220px] rotate-[35deg] rounded-[27%] bg-[#b7f1d9] mix-blend-multiply" style={{ animation: "float 8s ease-in-out infinite" }} />
    <div className="absolute right-[13%] top-[10%] size-[200px] rotate-[13deg] rounded-[30%] bg-[#ffc4ad] mix-blend-multiply" style={{ animation: "drift 11s ease-in-out infinite reverse" }} />
    <div className="absolute -right-12 bottom-[-40px] size-[270px] rotate-[42deg] rounded-[36%] bg-[#f5e3a8] mix-blend-multiply" style={{ animation: "float 10s ease-in-out infinite reverse" }} />
    <div className="absolute inset-0 bg-[radial-gradient(circle_at_50%_45%,rgba(255,254,250,.32),transparent_58%)]" />
  </div>;
}

function Sidebar({ conversations, activeId, onSelect, onNew, onDelete, open, onClose }: { conversations: ConversationRow[]; activeId: string; onSelect: (id: string) => void; onNew: () => void; onDelete: (id: string) => void; open: boolean; onClose: () => void }) {
  return <>
    {open && <button aria-label="Close sidebar" onClick={onClose} className="fixed inset-0 z-30 bg-[#17151d]/20 lg:hidden" />}
    <aside className={cn("fixed inset-y-0 left-0 z-40 flex w-[282px] flex-col border-r border-[#dfddd5] bg-[#f7f6f1] transition-transform duration-200 lg:relative lg:translate-x-0", open ? "translate-x-0" : "-translate-x-full")}>
      <div className="flex items-center justify-between px-5 py-5"><Logo /><button onClick={onClose} className="rounded-lg p-2 text-muted-foreground hover:bg-white lg:hidden" aria-label="Close sidebar"><X className="size-4" /></button></div>
      <div className="px-4"><button onClick={onNew} className="flex w-full items-center justify-center gap-2 rounded-[13px] bg-[#201e29] px-4 py-3 text-sm font-semibold text-white shadow-[0_8px_20px_rgba(32,30,41,.14)] transition-transform hover:-translate-y-0.5"><Plus className="size-4" /> New chat <span className="ml-auto font-mono text-[10px] text-white/45">⌘ N</span></button></div>
      <div className="mt-6 flex-1 overflow-y-auto px-3">
        <div className="mb-2 flex items-center justify-between px-2"><span className="font-mono text-[10px] font-medium uppercase tracking-[.18em] text-muted-foreground">Recent chats</span><button className="text-muted-foreground hover:text-foreground" aria-label="Search history"><Search className="size-3.5" /></button></div>
        {conversations.length === 0 ? <div className="rounded-2xl border border-dashed border-[#d8d5cd] p-4 text-center text-xs leading-5 text-muted-foreground">Your conversations will appear here as you work.</div> : <div className="space-y-1">{conversations.map(row => <div key={row.id} className={cn("group flex items-center gap-2 rounded-xl px-3 py-2.5 text-left transition-colors", activeId === row.id ? "bg-white shadow-sm" : "hover:bg-white/70")}><button onClick={() => onSelect(row.id)} className="min-w-0 flex-1 text-left"><div className="truncate text-[13px] font-medium">{row.title}</div><div className="mt-0.5 flex items-center gap-1.5 text-[10px] text-muted-foreground"><Clock3 className="size-3" /> {formatTime(row.updatedAt)}</div></button><button onClick={() => onDelete(row.id)} className="rounded-md p-1.5 text-muted-foreground opacity-0 hover:bg-[#fff0ef] hover:text-[#d94b58] group-hover:opacity-100" aria-label={`Delete ${row.title}`}><Trash2 className="size-3.5" /></button></div>)}</div>}
      </div>
      <div className="border-t border-[#dfddd5] p-4"><div className="flex items-center gap-3 rounded-xl bg-white/60 px-3 py-3"><div className="grid size-8 place-items-center rounded-full bg-[#dff6ed] text-[#2e765c]"><UserRound className="size-4" /></div><div className="min-w-0 flex-1"><div className="truncate text-xs font-semibold">{"Your workspace"}</div><div className="truncate text-[10px] text-muted-foreground">{"Guest mode · local continuity"}</div></div><button className="text-muted-foreground hover:text-foreground" aria-label="Settings"><Settings2 className="size-4" /></button></div></div>
    </aside>
  </>;
}

function Composer({ value, onChange, onSubmit, onAttach, onMic, isRecording, isLoading, pendingAttachment, onClearAttachment, placeholder }: { value: string; onChange: (value: string) => void; onSubmit: () => void; onAttach: () => void; onMic: () => void; isRecording: boolean; isLoading: boolean; pendingAttachment?: Attachment; onClearAttachment: () => void; placeholder: string }) {
  return <div className="relative rounded-[22px] border border-[#d9d6ce] bg-[#fffefa] p-2 shadow-[0_12px_38px_rgba(51,42,80,.10)] transition-shadow focus-within:border-[#aaa0ef] focus-within:shadow-[0_15px_42px_rgba(108,92,231,.13)]">
    {pendingAttachment && <div className="mx-2 mb-2 flex items-center gap-2 rounded-xl bg-[#f2f0ea] px-3 py-2 text-xs"><div className="grid size-7 place-items-center rounded-lg bg-white text-[#6c5ce7]">{pendingAttachment.kind === "image" ? <ImageIcon className="size-3.5" /> : <FileText className="size-3.5" />}</div><span className="min-w-0 flex-1 truncate font-medium">{pendingAttachment.fileName}</span><button onClick={onClearAttachment} className="rounded-md p-1 text-muted-foreground hover:bg-white" aria-label="Remove attachment"><X className="size-3.5" /></button></div>}
    <textarea value={value} onChange={event => onChange(event.target.value)} onKeyDown={event => { if (event.key === "Enter" && !event.shiftKey) { event.preventDefault(); onSubmit(); } }} placeholder={placeholder} rows={2} className="min-h-[55px] w-full resize-none bg-transparent px-3 py-2 text-[14px] leading-6 outline-none placeholder:text-[#98939b]" aria-label="Message Luma" />
    <div className="flex items-center justify-between px-1.5 pb-0.5"><div className="flex items-center gap-1"><button onClick={onAttach} className="rounded-xl p-2 text-[#77737c] transition-colors hover:bg-[#f1efe9] hover:text-foreground" aria-label="Attach image or document"><Paperclip className="size-[17px]" /></button><button onClick={onMic} className={cn("rounded-xl p-2 transition-colors", isRecording ? "bg-[#fff0ef] text-[#d94b58]" : "text-[#77737c] hover:bg-[#f1efe9] hover:text-foreground")} aria-label={isRecording ? "Stop recording" : "Start voice input"}>{isRecording ? <MicOff className="size-[17px]" /> : <Mic className="size-[17px]" />}</button><span className="hidden pl-1 font-mono text-[10px] text-muted-foreground sm:inline">Enter to send · Shift + Enter for a new line</span></div><button onClick={onSubmit} disabled={isLoading || (!value.trim() && !pendingAttachment)} className="grid size-9 place-items-center rounded-[13px] bg-[#6c5ce7] text-white shadow-[0_7px_16px_rgba(108,92,231,.28)] transition-all hover:bg-[#5949d3] disabled:cursor-not-allowed disabled:opacity-40" aria-label="Send message">{isLoading ? <span className="flex gap-0.5"><i className="typing-dot size-1.5 rounded-full bg-white" /><i className="typing-dot size-1.5 rounded-full bg-white" /><i className="typing-dot size-1.5 rounded-full bg-white" /></span> : <ArrowUp className="size-[18px]" />}</button></div>
  </div>;
}

function AttachmentCard({ attachment }: { attachment: Attachment }) {
  return <div className="mb-2 flex max-w-[270px] items-center gap-3 rounded-xl border border-black/5 bg-white/60 p-2.5"><div className="grid size-10 shrink-0 place-items-center overflow-hidden rounded-lg bg-[#ece9ff] text-[#6c5ce7]">{attachment.preview ? <img src={attachment.preview} alt="Uploaded preview" className="size-full object-cover" /> : attachment.kind === "image" ? <ImageIcon className="size-5" /> : <FileText className="size-5" />}</div><div className="min-w-0"><div className="truncate text-xs font-semibold">{attachment.fileName}</div><div className="mt-0.5 text-[10px] uppercase tracking-wide text-muted-foreground">{attachment.kind} · ready</div></div></div>;
}

function ResponseActions({ message, onRegenerate }: { message: ChatMessage; onRegenerate: () => void }) {
  const [copied, setCopied] = useState(false);
  const [speaking, setSpeaking] = useState(false);
  const copy = async () => { await navigator.clipboard?.writeText(message.content); setCopied(true); toast.success("Copied to clipboard"); window.setTimeout(() => setCopied(false), 1500); };
  const listen = () => { if (!window.speechSynthesis) { toast.error("Speech playback is not supported in this browser."); return; } window.speechSynthesis.cancel(); const utterance = new SpeechSynthesisUtterance(message.content.replace(/[#*_`]/g, "")); utterance.onend = () => setSpeaking(false); setSpeaking(true); window.speechSynthesis.speak(utterance); };
  const stop = () => { window.speechSynthesis?.cancel(); setSpeaking(false); };
  return <div className="mt-3 flex items-center gap-0.5 text-muted-foreground"><button onClick={copy} className="rounded-lg p-1.5 hover:bg-[#eeece5] hover:text-foreground" aria-label="Copy response">{copied ? <Check className="size-3.5 text-[#39836c]" /> : <Clipboard className="size-3.5" />}</button><button onClick={speaking ? stop : listen} className="rounded-lg p-1.5 hover:bg-[#eeece5] hover:text-foreground" aria-label={speaking ? "Stop listening" : "Listen to response"}>{speaking ? <Square className="size-3.5" /> : <Volume2 className="size-3.5" />}</button><button onClick={onRegenerate} className="rounded-lg p-1.5 hover:bg-[#eeece5] hover:text-foreground" aria-label="Regenerate response"><RotateCcw className="size-3.5" /></button><span className="mx-1 h-3 w-px bg-[#d8d5cd]" /><button onClick={() => toast.success("Thanks for the feedback")} className="rounded-lg p-1.5 hover:bg-[#eeece5] hover:text-[#39836c]" aria-label="Helpful response"><ThumbsUp className="size-3.5" /></button><button onClick={() => toast.success("Thanks — we'll use that feedback")} className="rounded-lg p-1.5 hover:bg-[#eeece5] hover:text-[#d94b58]" aria-label="Unhelpful response"><ThumbsDown className="size-3.5" /></button></div>;
}

function MessageView({ message, onRegenerate }: { message: ChatMessage; onRegenerate: () => void }) {
  const isUser = message.role === "user";
  return <div className={cn("flex gap-3", isUser ? "justify-end" : "justify-start")}><div className={cn("flex max-w-[min(760px,90%)] gap-3", isUser && "flex-row-reverse")}><div className={cn("mt-1 grid size-8 shrink-0 place-items-center rounded-full", isUser ? "bg-[#201e29] text-white" : "bg-[#dff6ed] text-[#39836c]")}>{isUser ? <UserRound className="size-3.5" /> : <Sparkles className="size-4" />}</div><div><div className={cn("rounded-[18px] px-4 py-3 text-[14px] leading-6", isUser ? "bg-[#201e29] text-white" : "bg-white/80 text-foreground shadow-[0_5px_18px_rgba(42,38,58,.05)]")}>{message.attachment && <AttachmentCard attachment={message.attachment} />}{isUser ? <div className="whitespace-pre-wrap">{message.content}</div> : <div className="prose-luma"><Streamdown>{message.content}</Streamdown></div>}</div>{!isUser && <ResponseActions message={message} onRegenerate={onRegenerate} />}</div></div></div>;
}

export default function Home() {
  const { user } = useAuth();
  const [sidebarOpen, setSidebarOpen] = useState(false);
  const [input, setInput] = useState("");
  const [messages, setMessages] = useState<ChatMessage[]>([]);
  const [localRows, setLocalRows] = useState<ConversationRow[]>(() => getLocalRows());
  const [localMessageMap, setLocalMessageMap] = useState<Record<string, ChatMessage[]>>(() => getLocalMessages());
  const [activeId, setActiveId] = useState(() => getLocalRows()[0]?.id ?? makeGuestId());
  const [pendingAttachment, setPendingAttachment] = useState<Attachment>();
  const [pendingDataUri, setPendingDataUri] = useState<string>();
  const [intent, setIntent] = useState<Intent>("general");
  const [isRecording, setIsRecording] = useState(false);
  const [isSpeaking, setIsSpeaking] = useState(false);
  const [errorMessage, setErrorMessage] = useState("");
  const fileInputRef = useRef<HTMLInputElement>(null);
  const recognitionRef = useRef<SpeechRecognitionLike | undefined>(undefined);

  const isAuthenticated = Boolean(user);
  const numericActiveId = /^\d+$/.test(activeId) ? Number(activeId) : undefined;
  const serverRowsQuery = trpc.conversations.list.useQuery(undefined, { enabled: isAuthenticated });
  const serverMessagesQuery = trpc.conversations.messages.useQuery({ conversationId: numericActiveId ?? 0 }, { enabled: Boolean(isAuthenticated && numericActiveId) });
  const utils = trpc.useUtils();
  const createConversation = trpc.conversations.create.useMutation();
  const deleteConversation = trpc.conversations.delete.useMutation();
  const chatMutation = trpc.ai.chat.useMutation();
  const visionMutation = trpc.ai.vision.useMutation();
  const documentMutation = trpc.ai.document.useMutation();
  const isLoading = chatMutation.isPending || visionMutation.isPending || documentMutation.isPending;

  const conversationRows = useMemo(() => isAuthenticated ? (serverRowsQuery.data ?? []).map(row => ({ id: String(row.id), title: row.title, updatedAt: row.updatedAt })) : localRows, [isAuthenticated, localRows, serverRowsQuery.data]);
  const activeTitle = conversationRows.find(row => row.id === activeId)?.title ?? "New conversation";

  useEffect(() => {
    if (numericActiveId && serverMessagesQuery.data) {
      setMessages(serverMessagesQuery.data.filter(message => message.role !== "system").map(message => ({ id: String(message.id), role: message.role as "user" | "assistant", content: message.content })));
    }
  }, [numericActiveId, serverMessagesQuery.data]);
  useEffect(() => {
    if (!numericActiveId) setMessages(localMessageMap[activeId] ?? []);
  }, [activeId, numericActiveId, localMessageMap]);
  useEffect(() => { localStorage.setItem(LOCAL_CONVERSATIONS, JSON.stringify(localRows)); }, [localRows]);
  useEffect(() => { localStorage.setItem(LOCAL_MESSAGES, JSON.stringify(localMessageMap)); }, [localMessageMap]);
  useEffect(() => () => { recognitionRef.current?.stop(); window.speechSynthesis?.cancel(); }, []);

  const ensureConversation = async (title: string) => {
    if (!isAuthenticated || numericActiveId) return numericActiveId;
    const createdId = await createConversation.mutateAsync({ title: title.slice(0, 80) || "New conversation" });
    if (createdId) { setActiveId(String(createdId.id)); await utils.conversations.list.invalidate(); return createdId.id; }
    return undefined;
  };

  const appendMessages = (next: ChatMessage[]) => {
    setMessages(next);
    if (!numericActiveId) setLocalMessageMap(previous => ({ ...previous, [activeId]: next }));
  };

  const handleSend = async (override?: string) => {
    const prompt = (override ?? input).trim();
    if ((!prompt && !pendingAttachment) || isLoading) return;
    setErrorMessage("");
    const conversationId = await ensureConversation(prompt || pendingAttachment?.fileName || "New conversation");
    const attachment = pendingAttachment;
    const dataUri = pendingDataUri;
    const userMessage: ChatMessage = { id: `user-${Date.now()}`, role: "user", content: prompt || `Analyze ${attachment?.fileName ?? "this file"}`, attachment };
    const nextMessages = [...messages, userMessage];
    appendMessages(nextMessages);
    setInput(""); setPendingAttachment(undefined); setPendingDataUri(undefined);
    try {
      const history = nextMessages.slice(-30).map(message => ({ role: message.role, content: message.content as string }));
      let response: { answer: string; intent: Intent; demo?: boolean };
      if (attachment && dataUri) {
        const payload = { conversationId, prompt: prompt || (attachment.kind === "image" ? "Describe and analyze this image." : "Summarize this document and highlight key information."), history, attachment: { fileName: attachment.fileName, mimeType: attachment.mimeType, dataUri, size: Math.floor((dataUri.length * 3) / 4) }, ...(attachment.kind === "document" && attachment.mimeType === "text/plain" ? { extractedText: atob(dataUri.split(",")[1] ?? "") } : {}) };
        response = attachment.kind === "image" ? await visionMutation.mutateAsync(payload) : await documentMutation.mutateAsync(payload);
      } else {
        const requestedIntent = intent === "architecture" || intent === "voice" ? intent : undefined;
        response = await chatMutation.mutateAsync({ conversationId, prompt, history, requestedIntent });
      }
      appendMessages([...nextMessages, { id: `assistant-${Date.now()}`, role: "assistant", content: response.answer, demo: response.demo }]);
      if (response.demo) toast.info("Demo mode is active", { description: "Add the platform AI credentials to enable live responses." });
    } catch (error) {
      const message = error instanceof Error ? error.message : "Something went wrong. Please try again.";
      setErrorMessage(message);
      toast.error("Could not complete that request", { description: message });
    }
  };

  const handleNew = () => { const id = makeGuestId(); setActiveId(id); setMessages([]); setInput(""); setPendingAttachment(undefined); setPendingDataUri(undefined); setIntent("general"); setSidebarOpen(false); setLocalRows(previous => [{ id, title: "New conversation", updatedAt: new Date().toISOString(), isGuest: true }, ...previous].slice(0, 20)); };
  const handleSelect = (id: string) => { setActiveId(id); setSidebarOpen(false); setErrorMessage(""); };
  const handleDelete = async (id: string) => { if (/^\d+$/.test(id) && isAuthenticated) { await deleteConversation.mutateAsync({ id: Number(id) }); await utils.conversations.list.invalidate(); } else { setLocalRows(previous => previous.filter(row => row.id !== id)); setLocalMessageMap(previous => { const next = { ...previous }; delete next[id]; return next; }); } if (activeId === id) handleNew(); };
  const handleAttach = () => fileInputRef.current?.click();
  const handleFile = async (file?: File) => {
    if (!file) return;
    if (file.size > MAX_FILE_BYTES) { toast.error("That file is too large", { description: "Please choose a file under 10 MB." }); return; }
    const image = ["image/jpeg", "image/png", "image/webp"].includes(file.type);
    const documentFile = ["application/pdf", "text/plain", "application/vnd.openxmlformats-officedocument.wordprocessingml.document"].includes(file.type);
    if (!image && !documentFile) { toast.error("Unsupported file type", { description: "Use JPG, PNG, WEBP, PDF, TXT, or DOCX." }); return; }
    const dataUri = await fileToDataUri(file);
    setPendingAttachment({ fileName: file.name, mimeType: file.type, kind: image ? "image" : "document", preview: image ? dataUri : undefined });
    setPendingDataUri(dataUri);
    setIntent(image ? "image" : "document");
  };
  const handleMic = () => {
    const speechWindow = window as WindowWithSpeech;
    const Recognition = speechWindow.SpeechRecognition ?? speechWindow.webkitSpeechRecognition;
    if (!Recognition) { toast.error("Voice input is not supported in this browser", { description: "You can still type or attach files." }); return; }
    if (isRecording) { recognitionRef.current?.stop(); setIsRecording(false); return; }
    const recognition = new Recognition();
    recognition.lang = navigator.language || "en-US"; recognition.interimResults = false; recognition.continuous = false;
    recognition.onresult = event => { const transcript = event.results[0]?.[0]?.transcript ?? ""; setInput(previous => previous ? `${previous} ${transcript}` : transcript); setIntent("voice"); };
    recognition.onend = () => setIsRecording(false); recognition.onerror = () => { setIsRecording(false); toast.error("Could not access the microphone"); };
    recognitionRef.current = recognition; setIsRecording(true); recognition.start();
  };
  const regenerateLast = () => { const lastUser = [...messages].reverse().find(message => message.role === "user"); if (lastUser) { setMessages(messages.slice(0, -1).filter(message => message.role !== "assistant" || message.id !== messages[messages.length - 1]?.id)); setInput(lastUser.content); window.setTimeout(() => handleSend(lastUser.content), 0); } };

  const hasMessages = messages.length > 0;
  const placeholder = intent === "architecture" ? "Ask about a plan, site, building, or material..." : intent === "image" ? "What should I look for in the image?" : intent === "document" ? "Ask a question about your document..." : "Ask Luma anything...";

  return <div className="flex min-h-screen bg-[#f6f5ef] text-[#1e1d25]">
    <Sidebar conversations={conversationRows} activeId={activeId} onSelect={handleSelect} onNew={handleNew} onDelete={handleDelete} open={sidebarOpen} onClose={() => setSidebarOpen(false)} />
    <div className="relative flex min-w-0 flex-1 flex-col overflow-hidden">
      <header className="relative z-20 flex h-[72px] shrink-0 items-center justify-between border-b border-[#dfddd5]/75 bg-[#f6f5ef]/85 px-4 backdrop-blur-xl sm:px-7"><div className="flex items-center gap-3"><button className="rounded-xl p-2 hover:bg-white lg:hidden" onClick={() => setSidebarOpen(true)} aria-label="Open history"><Menu className="size-[19px]" /></button><div className="lg:hidden"><Logo compact /></div><div className="hidden items-center gap-2 lg:flex"><button onClick={() => setSidebarOpen(value => !value)} className="rounded-xl p-2 text-muted-foreground hover:bg-white" aria-label="Toggle history"><PanelLeftOpen className="size-[17px]" /></button><span className="font-display text-sm font-semibold">{hasMessages ? activeTitle : "Workspace"}</span></div></div><div className="flex items-center gap-2"><div className="hidden items-center gap-2 rounded-full border border-[#dcd9d0] bg-white/55 px-3 py-1.5 sm:flex"><span className="size-1.5 rounded-full bg-[#54bf8e] shadow-[0_0_0_4px_rgba(84,191,142,.12)]" /><span className="font-mono text-[10px] uppercase tracking-[.14em] text-muted-foreground">{isAuthenticated ? "Synced" : "Local mode"}</span></div><button className="rounded-xl p-2 text-muted-foreground hover:bg-white" aria-label="More options"><MoreHorizontal className="size-[18px]" /></button></div></header>
      <div className="relative flex min-h-0 flex-1 flex-col">
        {!hasMessages ? <div className="relative flex flex-1 flex-col items-center justify-center overflow-hidden px-4 py-10 sm:px-8"><GeometricField /><div className="relative z-10 w-full max-w-[930px] text-center"><div className="mb-5 inline-flex items-center gap-2 rounded-full border border-[#dbd6c9] bg-white/55 px-3 py-1.5 shadow-sm backdrop-blur-sm"><span className="grid size-5 place-items-center rounded-full bg-[#201e29] text-white"><Zap className="size-2.5" /></span><span className="font-mono text-[10px] uppercase tracking-[.16em] text-[#6d6870]">One workspace. Every modality.</span></div><h1 className="font-display mx-auto max-w-[790px] text-[clamp(2.8rem,7vw,6.35rem)] font-semibold leading-[.94] tracking-[-.075em] text-[#201e29]">Ask anything.<br /><span className="text-[#6c5ce7]">Speak anything.</span><br />Upload anything.</h1><p className="mx-auto mt-7 max-w-[590px] text-[15px] leading-7 text-[#77737c] sm:text-[16px]">Luma brings text, voice, images, documents, and architecture-aware thinking into one calm place to explore ideas.</p><div className="mx-auto mt-9 max-w-[720px] text-left"><Composer value={input} onChange={setInput} onSubmit={() => handleSend()} onAttach={handleAttach} onMic={handleMic} isRecording={isRecording} isLoading={isLoading} pendingAttachment={pendingAttachment} onClearAttachment={() => { setPendingAttachment(undefined); setPendingDataUri(undefined); }} placeholder={placeholder} /><div className="mt-3 flex items-center justify-center gap-2 text-[11px] text-muted-foreground"><LockMark /> Your messages stay private in your workspace.</div></div><div className="mx-auto mt-12 grid w-full max-w-[830px] grid-cols-2 gap-2.5 text-left sm:grid-cols-5">{quickActions.map(action => <button key={action.label} onClick={() => { setIntent(action.intent); if (action.intent === "image" || action.intent === "document") handleAttach(); else if (action.intent === "voice") handleMic(); else setInput(action.intent === "architecture" ? "Help me think through a building design brief" : ""); }} className="group rounded-[16px] border border-[#dedbd2]/90 bg-white/55 p-3 text-left backdrop-blur-sm transition-all hover:-translate-y-1 hover:bg-white hover:shadow-[0_11px_26px_rgba(52,45,73,.08)]"><span className={cn("mb-3 grid size-8 place-items-center rounded-[10px]", action.tint)}><action.icon className="size-4" /></span><span className="block text-[12px] font-semibold leading-4">{action.label}</span><span className="mt-1 block text-[10px] leading-4 text-muted-foreground">{action.description}</span></button>)}</div></div></div> : <div className="relative flex min-h-0 flex-1 flex-col"><div className="flex-1 overflow-y-auto px-4 py-8 sm:px-8"><div className="mx-auto max-w-[780px] space-y-7">{messages.map((message, index) => <MessageView key={message.id} message={message} onRegenerate={() => { const previous = messages.slice(0, index).reverse().find(item => item.role === "user"); if (previous) { setInput(previous.content); window.setTimeout(() => handleSend(previous.content), 0); } }} />)}{isLoading && <div className="flex gap-3"><div className="mt-1 grid size-8 place-items-center rounded-full bg-[#dff6ed] text-[#39836c]"><Sparkles className="size-4" /></div><div className="rounded-[18px] bg-white/75 px-4 py-3 shadow-sm"><div className="flex items-center gap-1"><i className="typing-dot size-1.5 rounded-full bg-[#6c5ce7]" /><i className="typing-dot size-1.5 rounded-full bg-[#6c5ce7]" /><i className="typing-dot size-1.5 rounded-full bg-[#6c5ce7]" /></div></div></div>}{errorMessage && <div className="flex items-center gap-2 rounded-xl border border-[#f0b9b4] bg-[#fff3f0] px-3 py-2 text-xs text-[#ad4b48]"><StopCircle className="size-3.5" /> {errorMessage}<button onClick={() => setErrorMessage("")} className="ml-auto"><X className="size-3.5" /></button></div>}</div></div><div className="relative shrink-0 border-t border-[#dfddd5]/60 bg-[#f6f5ef]/92 px-4 pb-5 pt-4 backdrop-blur-xl sm:px-8"><div className="mx-auto max-w-[780px]"><div className="mb-2 flex items-center justify-between px-1"><div className="flex items-center gap-2 text-[11px] text-muted-foreground"><span className="grid size-5 place-items-center rounded-md bg-[#e9e4ff] text-[#6c5ce7]"><Bot className="size-3" /></span>{intent === "architecture" ? "Architecture intelligence on" : "Luma is ready"}</div>{isSpeaking && <button onClick={() => { window.speechSynthesis?.cancel(); setIsSpeaking(false); }} className="flex items-center gap-1.5 text-[11px] text-[#6c5ce7]"><StopCircle className="size-3.5" /> Stop voice</button>}</div><Composer value={input} onChange={setInput} onSubmit={() => handleSend()} onAttach={handleAttach} onMic={handleMic} isRecording={isRecording} isLoading={isLoading} pendingAttachment={pendingAttachment} onClearAttachment={() => { setPendingAttachment(undefined); setPendingDataUri(undefined); }} placeholder={placeholder} /></div></div></div>}
      </div>
      <input ref={fileInputRef} type="file" className="hidden" accept="image/jpeg,image/png,image/webp,application/pdf,text/plain,application/vnd.openxmlformats-officedocument.wordprocessingml.document" onChange={event => { void handleFile(event.target.files?.[0]); event.currentTarget.value = ""; }} />
    </div>
  </div>;
}

function LockMark() { return <span className="inline-flex items-center gap-1.5"><span className="relative inline-block size-2.5 rounded-[2px] border border-[#77737c] before:absolute before:-top-1 left-0.5 before:size-1 before:rounded-t-full before:border before:border-b-0 before:border-[#77737c]" /> </span>; }
