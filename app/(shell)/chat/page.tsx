"use client";

import "./chat.css";
import Link from "next/link";
import ReactMarkdown from "react-markdown";
import remarkGfm from "remark-gfm";
import { Clock } from "lucide-react";
import {
  useCallback,
  useEffect,
  useMemo,
  useRef,
  useState,
  type MouseEvent as ReactMouseEvent,
} from "react";
import type { ConnectionSettings } from "@/lib/settings/connection-storage";
import { loadConnection } from "@/lib/settings/connection-storage";
import { checkApiKeyAccess } from "@/lib/settings/org-validation-guard";
import { getAllVectorStores } from "@/lib/storage/indexed-db";
import { fetchModelsFromApi, getDefaultModels, type ModelInfo } from "@/lib/openai/models";
import {
  FEATURE_RESTRICTIONS_EVENT,
  FEATURE_RESTRICTIONS_STORAGE_KEY,
  loadFeatureRestrictions,
  type FeatureRestrictions,
} from "@/lib/settings/feature-restrictions";
import { PageLoading } from "@/components/ui/page-loading";
import type {
  ConversationRecord,
  MessagePart,
  MessageRecord,
  VectorStoreRecord,
} from "@/lib/storage/schema";
import {
  createAssistantDraft,
  createUserMessage,
  withAssistantText,
} from "@/lib/chat/message-utils";
import {
  createConversationDraft,
  deleteConversation,
  listConversations,
  loadConversationMessages,
  loadConversationMessagesPaginated,
  pruneConversationsOlderThan,
  saveConversation,
  saveMessages,
  touchConversation,
} from "@/lib/chat/session";
import { streamAssistantResponse } from "@/lib/chat/streaming";
import { validateFile, formatFileSize } from "@/lib/chat/file-validation";
import { uploadFileToOpenAI, type UploadedFileInfo } from "@/lib/chat/file-upload";
import { createTempVectorStoreForChat, formatExpiryInfo } from "@/lib/chat/auto-vector-store";
import type { AttachedFileInfo } from "@/lib/storage/schema";
import {
  loadRolePresets,
  addRolePreset,
  deleteRolePreset,
  updateRolePreset,
  type RolePreset,
} from "@/lib/settings/role-presets";

const DEFAULT_MODEL = "gpt-4o-mini";
const CONVERSATION_RETENTION_DAYS = 14;
const DEFAULT_LEFT_WIDTH = 320;
const DEFAULT_RIGHT_WIDTH = 384;
const LEFT_MIN_WIDTH = 220;
const RIGHT_MIN_WIDTH = 260;
const MAIN_MIN_WIDTH = 520;

const ROLE_LABEL: Record<MessageRecord["role"], string> = {
  user: "You",
  assistant: "Assistant",
  system: "System",
  tool: "Tool",
};

const DEFAULT_CONVERSATION_TITLE = "新規チャット";

function generateAutoTitle(text: string) {
  const cleaned = text.replace(/\s+/g, " ").trim();
  if (!cleaned) {
    return DEFAULT_CONVERSATION_TITLE;
  }
  const sliced = cleaned.slice(0, 30);
  return cleaned.length > sliced.length ? `${sliced}…` : sliced;
}

function shouldAutoTitle(conversation: ConversationRecord) {
  const title = (conversation.title ?? "").trim();
  return !title || title === DEFAULT_CONVERSATION_TITLE;
}

function formatTimestamp(value: string) {
  try {
    return new Date(value).toLocaleString();
  } catch {
    return value;
  }
}

export default function ChatPage() {
  const [initializing, setInitializing] = useState(true);
  const [connection, setConnection] = useState<ConnectionSettings | null>(null);
  const [connectionError, setConnectionError] = useState<string | null>(null);
  const [vectorStores, setVectorStores] = useState<VectorStoreRecord[]>([]);
  const [conversations, setConversations] = useState<ConversationRecord[]>([]);
  const [activeConversationId, setActiveConversationId] = useState<string | null>(
    null,
  );
  const [messages, setMessages] = useState<MessageRecord[]>([]);
  const [inputValue, setInputValue] = useState("");
  const [selectedModel, setSelectedModel] = useState(DEFAULT_MODEL);
  const [webSearchEnabled, setWebSearchEnabled] = useState(false);
  const [vectorSearchEnabled, setVectorSearchEnabled] = useState(false);
  const [selectedVectorStoreIds, setSelectedVectorStoreIds] = useState<string[]>([]);
  const [statusMessage, setStatusMessage] = useState<string | null>(null);
  const [sendError, setSendError] = useState<string | null>(null);
  const [vectorSelectionNotice, setVectorSelectionNotice] = useState<string | null>(
    null,
  );
  const [isStreaming, setIsStreaming] = useState(false);
  const [editingConversationId, setEditingConversationId] = useState<string | null>(null);
  const [editingTitle, setEditingTitle] = useState("");
  const [editingTagInput, setEditingTagInput] = useState("");
  const [availableModels, setAvailableModels] = useState<ModelInfo[]>(getDefaultModels());
  const [settingsPanelOpen, setSettingsPanelOpen] = useState(true);
  const [historyPanelOpen, setHistoryPanelOpen] = useState(false);
  const [leftSidebarWidth, setLeftSidebarWidth] = useState(DEFAULT_LEFT_WIDTH);
  const [rightSidebarWidth, setRightSidebarWidth] = useState(DEFAULT_RIGHT_WIDTH);
  const [activeResize, setActiveResize] = useState<"left" | "right" | null>(null);
  const [searchQuery, setSearchQuery] = useState("");
  const [searching, setSearching] = useState(false);
  const [searchResults, setSearchResults] = useState<{
    title: ConversationRecord[];
    tags: ConversationRecord[];
    messages: ConversationRecord[];
  } | null>(null);
  const [featureRestrictions, setFeatureRestrictionsState] = useState<FeatureRestrictions>(() => loadFeatureRestrictions());
  const [attachedFiles, setAttachedFiles] = useState<Array<{ file: File; purpose: 'vision' | 'assistants'; isImage: boolean }>>([]);
  const [uploadingFiles, setUploadingFiles] = useState(false);
  const fileInputRef = useRef<HTMLInputElement | null>(null);
  const [chatFontSize, setChatFontSize] = useState(100); // パーセンテージ: 100 = 標準
  const [systemRoleEnabled, setSystemRoleEnabled] = useState(false);
  const [systemRole, setSystemRole] = useState("");
  const [rolePresets, setRolePresets] = useState<RolePreset[]>([]);
  const [selectedPresetId, setSelectedPresetId] = useState<string>("");
  const [showPresetDialog, setShowPresetDialog] = useState(false);
  const [newPresetName, setNewPresetName] = useState("");
  const [copiedMessageId, setCopiedMessageId] = useState<string | null>(null);
  const [editingPresetId, setEditingPresetId] = useState<string | null>(null);
  const [editingPresetName, setEditingPresetName] = useState("");
  const [copiedVectorStoreId, setCopiedVectorStoreId] = useState<string | null>(null);
  const [loadingOlderMessages, setLoadingOlderMessages] = useState(false);
  const [hasMoreMessages, setHasMoreMessages] = useState(false);
  const [totalMessageCount, setTotalMessageCount] = useState(0);
  const messagesContainerRef = useRef<HTMLDivElement | null>(null);

  const showSearchResults = searchQuery.trim().length > 0;
  const totalMatches = searchResults
    ? searchResults.title.length + searchResults.tags.length + searchResults.messages.length
    : 0;
  const canUseWebSearch = featureRestrictions.allowWebSearch;
  const canUseVectorStore = featureRestrictions.allowVectorStore;
  const canAttachFiles = featureRestrictions.allowFileUpload && featureRestrictions.allowChatFileAttachment;

  // ドキュメントファイル（file_search対象）が添付されているかチェック
  const hasDocumentAttachment = attachedFiles.some(item => item.purpose === 'assistants');

  // Vector Storeを一時的なものと永続的なものに分類
  const temporaryVectorStores = useMemo(
    () => vectorStores.filter(store => store.isTemporary),
    [vectorStores]
  );
  const permanentVectorStores = useMemo(
    () => vectorStores.filter(store => !store.isTemporary),
    [vectorStores]
  );

  useEffect(() => {
    if (typeof window === "undefined") {
      return;
    }

    const handleUpdate = () => {
      setFeatureRestrictionsState(loadFeatureRestrictions());
    };

    const handleStorage = (event: StorageEvent) => {
      if (event.key === FEATURE_RESTRICTIONS_STORAGE_KEY || event.key === `${FEATURE_RESTRICTIONS_STORAGE_KEY}:managed-by-secure-config`) {
        handleUpdate();
      }
    };

    window.addEventListener(FEATURE_RESTRICTIONS_EVENT, handleUpdate);
    window.addEventListener("storage", handleStorage);

    return () => {
      window.removeEventListener(FEATURE_RESTRICTIONS_EVENT, handleUpdate);
      window.removeEventListener("storage", handleStorage);
    };
  }, []);

  useEffect(() => {
    if (!canUseWebSearch && webSearchEnabled) {
      setWebSearchEnabled(false);
    }
  }, [canUseWebSearch, webSearchEnabled]);

  useEffect(() => {
    if (!canUseVectorStore) {
      if (vectorSearchEnabled) {
        setVectorSearchEnabled(false);
      }
      if (selectedVectorStoreIds.length > 0) {
        setSelectedVectorStoreIds([]);
      }
    }
  }, [canUseVectorStore, vectorSearchEnabled, selectedVectorStoreIds.length]);

  useEffect(() => {
    if (!canAttachFiles && attachedFiles.length > 0) {
      setAttachedFiles([]);
    }
  }, [canAttachFiles, attachedFiles.length]);

  const activeConversation = useMemo(
    () => conversations.find((conversation) => conversation.id === activeConversationId) ?? null,
    [conversations, activeConversationId],
  );

  const messagesRef = useRef<MessageRecord[]>(messages);
  const activeConversationRef = useRef<ConversationRecord | null>(activeConversation);
  const streamingControllerRef = useRef<AbortController | null>(null);
  const messageEndRef = useRef<HTMLDivElement | null>(null);
  const assistantSnapshotTimerRef = useRef<ReturnType<typeof setTimeout> | null>(null);
  const layoutRef = useRef<HTMLDivElement | null>(null);
  const resizeSnapshotRef = useRef<DOMRect | null>(null);

const scheduleAssistantSnapshotSave = useCallback((message: MessageRecord) => {
  if (assistantSnapshotTimerRef.current) {
    clearTimeout(assistantSnapshotTimerRef.current);
  }
  assistantSnapshotTimerRef.current = setTimeout(() => {
    void saveMessages([message]);
    assistantSnapshotTimerRef.current = null;
  }, 400);
}, []);

  const startResize = useCallback(
    (side: "left" | "right", event: ReactMouseEvent<HTMLDivElement>) => {
      event.preventDefault();
      if ((side === "left" && !historyPanelOpen) || (side === "right" && !settingsPanelOpen)) {
        return;
      }
      const container = layoutRef.current;
      if (!container) {
        return;
      }
      resizeSnapshotRef.current = container.getBoundingClientRect();
      setActiveResize(side);
    },
    [historyPanelOpen, settingsPanelOpen],
  );

  useEffect(() => {
    messagesRef.current = messages;
  }, [messages]);

  useEffect(() => {
    activeConversationRef.current = activeConversation;
  }, [activeConversation]);

  useEffect(() => {
    setEditingTagInput("");
  }, [activeConversationId]);

  useEffect(() => {
    let cancelled = false;
    (async () => {
      try {
        await pruneConversationsOlderThan(CONVERSATION_RETENTION_DAYS);

        const [loadedConnection, stores, existingConversations] = await Promise.all([
          loadConnection(),
          getAllVectorStores().catch(() => [] as VectorStoreRecord[]),
          listConversations(),
        ]);
        if (cancelled) {
          return;
        }

        setConnection(loadedConnection ?? null);
        if (!loadedConnection || !loadedConnection.apiKey) {
          setConnectionError(
            "ウェルカム画面で API キーと設定を入力してください。",
          );
        } else {
          setConnectionError(null);
        }

        setVectorStores(stores);

        let workingConversations = existingConversations;
        if (workingConversations.length === 0) {
          const draft = createConversationDraft();
          await saveConversation(draft);
          workingConversations = [draft];
        }
        setConversations(workingConversations);
        setActiveConversationId((prev) => prev ?? workingConversations[0]?.id ?? null);

        // モデル一覧を取得
        if (loadedConnection?.apiKey) {
          const models = await fetchModelsFromApi(loadedConnection);
          setAvailableModels(models);
        }

        // ロールプリセットを読み込み
        const presets = await loadRolePresets();
        setRolePresets(presets);
      } catch (error) {
        if (!cancelled) {
          setConnectionError(
            error instanceof Error ? error.message : "初期化に失敗しました。",
          );
        }
      } finally {
        if (!cancelled) {
          setInitializing(false);
        }
      }
    })();

    return () => {
      cancelled = true;
      streamingControllerRef.current?.abort();
      if (assistantSnapshotTimerRef.current) {
        clearTimeout(assistantSnapshotTimerRef.current);
        assistantSnapshotTimerRef.current = null;
      }
    };
  }, []);

  useEffect(() => {
    if (!activeConversation?.id) {
      setMessages([]);
      setHasMoreMessages(false);
      setTotalMessageCount(0);
      return;
    }
    let cancelled = false;
    (async () => {
      console.log("Loading messages for conversation:", activeConversation.id);
      // 初回は最新30件のみ読み込み
      const result = await loadConversationMessagesPaginated(activeConversation.id, { limit: 30 });
      console.log("Loaded messages:", result.messages.length, "Total:", result.totalCount);
      if (!cancelled) {
        setMessages(result.messages);
        setHasMoreMessages(result.hasMore);
        setTotalMessageCount(result.totalCount);
      }
    })();
    return () => {
      cancelled = true;
    };
  }, [activeConversation?.id]);

  useEffect(() => {
    if (!messageEndRef.current) {
      return;
    }
    // 少し遅延させてレンダリング完了後にスクロール
    const timeoutId = setTimeout(() => {
      messageEndRef.current?.scrollIntoView({ behavior: "smooth" });
    }, 100);
    return () => clearTimeout(timeoutId);
  }, [messages]);

  useEffect(() => {
    if (!activeResize) {
      return;
    }
    const handleMouseMove = (event: MouseEvent) => {
      const container = layoutRef.current;
      if (!container) {
        return;
      }
      const rect = resizeSnapshotRef.current ?? container.getBoundingClientRect();
      if (activeResize === "left") {
        let nextWidth = event.clientX - rect.left;
        const rightWidth = settingsPanelOpen ? rightSidebarWidth : 0;
        const maxWidth = Math.max(LEFT_MIN_WIDTH, rect.width - rightWidth - MAIN_MIN_WIDTH);
        nextWidth = Math.min(Math.max(nextWidth, LEFT_MIN_WIDTH), maxWidth);
        setLeftSidebarWidth(nextWidth);
      } else if (activeResize === "right") {
        const leftWidth = historyPanelOpen ? leftSidebarWidth : 0;
        let nextWidth = rect.right - event.clientX;
        const maxWidth = Math.max(RIGHT_MIN_WIDTH, rect.width - leftWidth - MAIN_MIN_WIDTH);
        nextWidth = Math.min(Math.max(nextWidth, RIGHT_MIN_WIDTH), maxWidth);
        setRightSidebarWidth(nextWidth);
      }
    };

    const handleMouseUp = () => {
      setActiveResize(null);
    };

    window.addEventListener("mousemove", handleMouseMove);
    window.addEventListener("mouseup", handleMouseUp);
    return () => {
      window.removeEventListener("mousemove", handleMouseMove);
      window.removeEventListener("mouseup", handleMouseUp);
    };
  }, [activeResize, historyPanelOpen, leftSidebarWidth, rightSidebarWidth, settingsPanelOpen]);

  useEffect(() => {
    if (activeResize) {
      document.body.style.userSelect = "none";
      document.body.style.cursor = "col-resize";
    } else {
      document.body.style.userSelect = "";
      document.body.style.cursor = "";
      resizeSnapshotRef.current = null;
    }
  }, [activeResize]);

  useEffect(() => {
    if (!historyPanelOpen && activeResize === "left") {
      setActiveResize(null);
    }
    if (!settingsPanelOpen && activeResize === "right") {
      setActiveResize(null);
    }
  }, [activeResize, historyPanelOpen, settingsPanelOpen]);

  useEffect(() => {
    if (!activeConversation) {
      return;
    }
    setSelectedModel(activeConversation.modelId ?? DEFAULT_MODEL);
    setWebSearchEnabled(activeConversation.webSearchEnabled ?? false);
    setVectorSearchEnabled(
      activeConversation.vectorSearchEnabled ??
        ((activeConversation.vectorStoreIds?.length ?? 0) > 0),
    );
    setSelectedVectorStoreIds(activeConversation.vectorStoreIds ?? []);
    setSystemRoleEnabled(activeConversation.systemRoleEnabled ?? false);
    setSystemRole(activeConversation.systemRole ?? "");
  }, [activeConversation]);

  const persistConversation = useCallback(
    async (patch: Partial<ConversationRecord>) => {
      const current = activeConversationRef.current;
      if (!current) {
        return null;
      }
      const next = await touchConversation(current, patch);
      setConversations((existing) => {
        const has = existing.some((conversation) => conversation.id === next.id);
        const updated = has
          ? existing.map((conversation) =>
              conversation.id === next.id ? next : conversation,
            )
          : [next, ...existing];
        return updated.sort((a, b) => (a.updatedAt > b.updatedAt ? -1 : 1));
      });
      setActiveConversationId(next.id);
      return next;
    },
    [],
  );

  const handleModelChange = useCallback(
    (event: React.ChangeEvent<HTMLInputElement>) => {
      setSelectedModel(event.target.value);
    },
    [],
  );

  const handleModelBlur = useCallback(() => {
    const normalized = (selectedModel || DEFAULT_MODEL).trim() || DEFAULT_MODEL;
    setSelectedModel(normalized);
    void persistConversation({ modelId: normalized });
  }, [persistConversation, selectedModel]);

  const handleWebSearchToggle = useCallback(
    (event: React.ChangeEvent<HTMLInputElement>) => {
      const checked = event.target.checked;
      setWebSearchEnabled(checked);
      void persistConversation({ webSearchEnabled: checked });
    },
    [persistConversation],
  );

  const handleVectorSearchToggle = useCallback(
    (event: React.ChangeEvent<HTMLInputElement>) => {
      const checked = event.target.checked;
      setVectorSearchEnabled(checked);
      void persistConversation({ vectorSearchEnabled: checked });
    },
    [persistConversation],
  );

  const handleConversationChange = useCallback(
    (event: React.ChangeEvent<HTMLSelectElement>) => {
      setActiveConversationId(event.target.value);
    },
    [],
  );

  const handleSend = useCallback(async () => {
    if (isStreaming) {
      return;
    }
    const currentConnection = connection;
    const conversation = activeConversationRef.current;
    const prompt = inputValue.trim();
    if (!conversation) {
      setSendError("会話が選択されていません。");
      return;
    }
    if (!currentConnection || !currentConnection.apiKey) {
      setSendError("G0 のウェルカム画面で API キーを復号してください。");
      return;
    }

    // 組織ID検証チェック（軽量）
    const accessError = await checkApiKeyAccess(currentConnection.apiKey);
    if (accessError) {
      setSendError(accessError);
      return;
    }

    if (!prompt) {
      return;
    }

    setSendError(null);
    setIsStreaming(true);

    const autoTitle = shouldAutoTitle(conversation)
      ? generateAutoTitle(prompt)
      : undefined;

    // ファイルアップロード処理
    let uploadedFileInfos: UploadedFileInfo[] = [];
    let attachedFileInfos: AttachedFileInfo[] = [];
    let fileUploadError: string | null = null;
    let tempVectorStoreId: string | null = null;
    let vectorStoreExpiryInfo: string | null = null;

    if (attachedFiles.length > 0) {
      try {
        setUploadingFiles(true);

        // ドキュメントファイルと画像ファイルを分類
        const documentFiles = attachedFiles.filter(item => item.purpose === 'assistants');
        const imageFiles = attachedFiles.filter(item => item.purpose === 'vision');

        // ドキュメントファイルがある場合、Vector Storeを自動作成
        if (documentFiles.length > 0) {
          const result = await createTempVectorStoreForChat(
            documentFiles.map(item => item.file),
            {
              connection: currentConnection,
              onProgress: (message) => setStatusMessage(message)
            }
          );

          tempVectorStoreId = result.vectorStoreId;
          vectorStoreExpiryInfo = formatExpiryInfo(result.vectorStoreRecord);

          // Vector Storesリストを更新
          setVectorStores(prev => [result.vectorStoreRecord, ...prev]);

          setStatusMessage(`Vector Store作成完了 (${vectorStoreExpiryInfo})`);
        }

        // 画像ファイルは従来通り直接アップロード
        if (imageFiles.length > 0) {
          setStatusMessage(`${imageFiles.length}件の画像をアップロード中…`);

          const uploadedImages = await Promise.all(
            imageFiles.map((item) =>
              uploadFileToOpenAI(item.file, item.purpose, currentConnection)
            )
          );

          uploadedFileInfos = uploadedImages;

          // IndexedDB保存用のファイル情報を作成
          attachedFileInfos = uploadedImages.map(info => ({
            fileName: info.fileName,
            fileSize: info.fileSize,
            fileId: info.fileId,
            purpose: info.purpose,
          }));
        }

        setStatusMessage("ファイルアップロード完了");
        setAttachedFiles([]);
      } catch (error) {
        const errorMessage = error instanceof Error ? error.message : "ファイルアップロードに失敗しました";
        console.error("ファイルアップロードエラー:", error);

        // エラーを記録するが、処理は続行
        fileUploadError = `⚠️ ファイル添付に失敗しました: ${errorMessage}\n\nファイルなしで回答を続けます...`;
        setStatusMessage("ファイルアップロードに失敗しましたが、チャットを続行します...");
        setAttachedFiles([]);
      } finally {
        setUploadingFiles(false);
      }
    }

    // ファイルアップロードエラーがあった場合、プロンプトに追記
    const finalPrompt = fileUploadError ? `${prompt}\n\n${fileUploadError}` : prompt;

    const userMessage = createUserMessage(conversation.id, finalPrompt, attachedFileInfos);
    const assistantDraft = createAssistantDraft(conversation.id);

    // メモリ最適化：スプレッド演算子の代わりにpushを使用
    const newMessages = messagesRef.current.concat([userMessage, assistantDraft]);
    setMessages(newMessages);
    messagesRef.current = newMessages;
    setInputValue("");

    setStatusMessage("OpenAI Responses API へ送信中…");

    try {
      await saveMessages([userMessage, assistantDraft]);

      const controller = new AbortController();
      streamingControllerRef.current = controller;

      // attachmentsを構築（画像のみ）
      const attachments = uploadedFileInfos.map(info => ({
        fileId: info.fileId,
        // vision（画像）の場合はツール不要
        tools: [],
      }));

      // Vector Store IDsを構築
      // 一時的に作成したVector Storeがある場合は必ず含める
      // 既存の選択されたVector Storeは、Vector Search有効時のみ含める
      const effectiveVectorStoreIds = tempVectorStoreId
        ? [...(vectorSearchEnabled ? selectedVectorStoreIds : []), tempVectorStoreId]
        : (vectorSearchEnabled ? selectedVectorStoreIds : []);

      // Vector Store使用時のWeb検索制限チェック
      const hasVectorStoreActive = effectiveVectorStoreIds.length > 0;
      const effectiveWebSearchEnabled = hasVectorStoreActive ? false : webSearchEnabled;

      if (hasVectorStoreActive && webSearchEnabled) {
        setStatusMessage("⚠️ Vector Store使用時はWeb検索を一時的に無効化します");
      }

      // メモリ最適化：直接参照を使用（コピー不要）
      const baseHistory = messagesRef.current;
      const result = await streamAssistantResponse(
        {
          connection: currentConnection,
          model: (selectedModel || DEFAULT_MODEL).trim() || DEFAULT_MODEL,
          messages: baseHistory,
          vectorStoreIds: effectiveVectorStoreIds.length > 0 ? effectiveVectorStoreIds : undefined,
          webSearchEnabled: effectiveWebSearchEnabled,
          abortSignal: controller.signal,
          attachments: attachments.length > 0 ? attachments : undefined,
          systemRole: systemRoleEnabled ? systemRole : undefined,
        },
        {
          onStatusChange: (status) => {
            setStatusMessage(status);
          },
          onTextSnapshot: (text) => {
            let pendingUpdate: MessageRecord | null = null;
            setMessages((current) =>
              current.map((message) => {
                if (message.id !== assistantDraft.id) {
                  return message;
                }
                const next = withAssistantText(message, text, "pending");
                pendingUpdate = next;
                return next;
              }),
            );
            if (pendingUpdate) {
              messagesRef.current = messagesRef.current.map((message) =>
                message.id === pendingUpdate!.id ? pendingUpdate! : message,
              );
              scheduleAssistantSnapshotSave(pendingUpdate);
            }
          },
        },
      );

      const assistantSnapshot =
        messagesRef.current.find((message) => message.id === assistantDraft.id) ?? assistantDraft;
      const existingTextPart = assistantSnapshot.parts.find(
        (part): part is MessagePart & { type: "text" } => part.type === "text",
      );
      const finalText = result.text || existingTextPart?.text || "";

      // 累計トークン数を計算
      const cumulativeTotal = messagesRef.current
        .reduce((sum, m) => sum + (m.tokenUsage?.totalTokens ?? 0), 0)
        + (result.tokenUsage?.totalTokens ?? 0);

      const tokenUsageWithCumulative = result.tokenUsage ? {
        ...result.tokenUsage,
        cumulativeTotal,
      } : undefined;

      const completedAssistant = withAssistantText(
        assistantSnapshot,
        finalText,
        "complete",
        undefined,
        result.sources,
        result.usedTools,
        undefined,
        tokenUsageWithCumulative,
      );

      setMessages((current) =>
        current.map((message) => (message.id === completedAssistant.id ? completedAssistant : message)),
      );

      messagesRef.current = messagesRef.current.map((message) =>
        message.id === completedAssistant.id ? completedAssistant : message,
      );

      if (assistantSnapshotTimerRef.current) {
        clearTimeout(assistantSnapshotTimerRef.current);
        assistantSnapshotTimerRef.current = null;
      }

      await saveMessages([completedAssistant]);

      // 一時的に作成したVector Store IDを会話に紐付けて保存
      // これにより、続きの会話でも同じVector Storeを参照できる
      const updatedVectorStoreIds = tempVectorStoreId
        ? [...new Set([...selectedVectorStoreIds, tempVectorStoreId])] // 重複を排除
        : selectedVectorStoreIds;

      // Vector Storeが使用された場合は、Vector Searchを自動的に有効化
      const shouldEnableVectorSearch = tempVectorStoreId ? true : vectorSearchEnabled;

      // Vector Store IDsを更新
      if (tempVectorStoreId && !selectedVectorStoreIds.includes(tempVectorStoreId)) {
        setSelectedVectorStoreIds(updatedVectorStoreIds);
        setVectorSearchEnabled(true); // 自動的にVector Searchを有効化
      }

      await persistConversation({
        modelId: selectedModel.trim() || DEFAULT_MODEL,
        webSearchEnabled,
        vectorSearchEnabled: shouldEnableVectorSearch,
        vectorStoreIds: updatedVectorStoreIds,
        hasContent: true,
        ...(autoTitle ? { title: autoTitle } : {}),
      });
      setStatusMessage("応答を受信しました。");
    } catch (error) {
      console.error(error);
      const errorMessage =
        error instanceof Error ? error.message : "Responses API 呼び出しに失敗しました。";
      const errorDetails = error instanceof Error ? error.stack : JSON.stringify(error);

      // エラー内容を含むテキストを作成
      const errorText = `❌ エラーが発生しました\n\n${errorMessage}\n\n詳細:\n${errorDetails || 'なし'}`;

      let failedAssistant: MessageRecord | null = null;
      setMessages((current) =>
        current.map((record) => {
          if (record.id !== assistantDraft.id) {
            return record;
          }
          const next = withAssistantText(
            record,
            errorText,
            "error",
            errorMessage,
            undefined,
            undefined,
            errorDetails
          );
          failedAssistant = next;
          return next;
        }),
      );

      if (failedAssistant) {
        messagesRef.current = messagesRef.current.map((record) =>
          record.id === failedAssistant!.id ? failedAssistant! : record,
        );
        if (assistantSnapshotTimerRef.current) {
          clearTimeout(assistantSnapshotTimerRef.current);
          assistantSnapshotTimerRef.current = null;
        }
      await saveMessages([failedAssistant]);
      }

      // エラー時でも一時的に作成したVector Store IDを保存
      const updatedVectorStoreIds = tempVectorStoreId
        ? [...new Set([...selectedVectorStoreIds, tempVectorStoreId])]
        : selectedVectorStoreIds;

      const shouldEnableVectorSearch = tempVectorStoreId ? true : vectorSearchEnabled;

      if (tempVectorStoreId && !selectedVectorStoreIds.includes(tempVectorStoreId)) {
        setSelectedVectorStoreIds(updatedVectorStoreIds);
        setVectorSearchEnabled(true);
      }

      await persistConversation({
        hasContent: true,
        vectorSearchEnabled: shouldEnableVectorSearch,
        vectorStoreIds: updatedVectorStoreIds,
        ...(autoTitle ? { title: autoTitle } : {})
      });

      setSendError(errorMessage);
      setStatusMessage("エラーが発生しました。");
    } finally {
      streamingControllerRef.current = null;
      if (assistantSnapshotTimerRef.current) {
        clearTimeout(assistantSnapshotTimerRef.current);
        assistantSnapshotTimerRef.current = null;
      }
      setIsStreaming(false);
    }
  }, [
    attachedFiles,
    connection,
    inputValue,
    isStreaming,
    persistConversation,
    scheduleAssistantSnapshotSave,
    selectedModel,
    selectedVectorStoreIds,
    vectorSearchEnabled,
    webSearchEnabled,
    systemRole,
    systemRoleEnabled,
  ]);

  const handleComposerKeyDown = useCallback(
    (event: React.KeyboardEvent<HTMLTextAreaElement>) => {
      if (event.key === "Enter" && (event.metaKey || event.ctrlKey)) {
        event.preventDefault();
        void handleSend();
      }
    },
    [handleSend],
  );

  const handleCreateNewConversation = useCallback(async () => {
    const draft = createConversationDraft();
    await saveConversation(draft);
    setConversations((prev) => [draft, ...prev]);
    setActiveConversationId(draft.id);
    setMessages([]);
  }, []);

  const handleStartEditTitle = useCallback((conversation: ConversationRecord) => {
    setEditingConversationId(conversation.id);
    setEditingTitle(conversation.title);
    setEditingTagInput("");
  }, []);

  const handleSaveTitle = useCallback(async () => {
    const conversation = conversations.find((conv) => conv.id === editingConversationId);
    if (!conversation || !editingTitle.trim()) {
      setEditingConversationId(null);
      setEditingTitle("");
      return;
    }
    const updated = await touchConversation(conversation, {
      title: editingTitle.trim(),
    }, true);
    setConversations((prev) =>
      prev.map((conv) => (conv.id === updated.id ? updated : conv)),
    );
    setEditingConversationId(null);
    setEditingTitle("");
  }, [conversations, editingConversationId, editingTitle]);

  const handleCancelEditTitle = useCallback(() => {
    setEditingConversationId(null);
    setEditingTitle("");
    setEditingTagInput("");
  }, []);

  const handleDeleteConversation = useCallback(async (conversation: ConversationRecord) => {
    if (conversation.isFavorite) {
      alert(`「${conversation.title}」はお気に入りに登録されているため削除できません。\n先にお気に入りを解除してください。`);
      return;
    }

    if (!confirm(`「${conversation.title}」を削除しますか？この操作は取り消せません。`)) {
      return;
    }

    await deleteConversation(conversation.id);

    const remaining = conversations.filter((conv) => conv.id !== conversation.id);
    setConversations(remaining);

    if (conversation.id === activeConversationId) {
      if (remaining.length > 0) {
        setActiveConversationId(remaining[0].id);
      } else {
        const draft = createConversationDraft();
        await saveConversation(draft);
        setConversations([draft]);
        setActiveConversationId(draft.id);
        setMessages([]);
      }
    }
  }, [conversations, activeConversationId]);

  const handleToggleFavorite = useCallback(
    async (conversation: ConversationRecord) => {
      const updated = await touchConversation(conversation, {
        isFavorite: !conversation.isFavorite,
      }, true);
      setConversations((prev) =>
        prev.map((item) => (item.id === updated.id ? updated : item)),
      );
    },
    [],
  );

  const handleAddTag = useCallback(
    async (conversation: ConversationRecord) => {
      const value = editingTagInput.trim();
      if (!value) {
        return;
      }
      const normalized = value.replace(/\s+/g, "-");
      if (conversation.tags.includes(normalized)) {
        setEditingTagInput("");
        return;
      }
      const nextTags = [...conversation.tags, normalized];
      setEditingTagInput("");
      const updated = await touchConversation(conversation, { tags: nextTags }, true);
      setConversations((prev) =>
        prev.map((conv) => (conv.id === updated.id ? updated : conv)),
      );
    },
    [editingTagInput],
  );

  const handleRemoveTag = useCallback(
    async (conversation: ConversationRecord, tag: string) => {
      const nextTags = conversation.tags.filter((item) => item !== tag);
      const updated = await touchConversation(conversation, { tags: nextTags }, true);
      setConversations((prev) =>
        prev.map((conv) => (conv.id === updated.id ? updated : conv)),
      );
    },
    [],
  );

  const handleFileSelect = useCallback((event: React.ChangeEvent<HTMLInputElement>) => {
    if (!canAttachFiles) {
      setSendError("管理者によりチャットでのファイル添付が無効化されています。");
      if (event.target) {
        event.target.value = "";
      }
      return;
    }

    const files = Array.from(event.target.files || []);
    const validatedFiles: typeof attachedFiles = [];
    const errors: string[] = [];

    for (const file of files) {
      const result = validateFile(file);
      if (result.error) {
        errors.push(result.error.message);
      } else if (result.validated) {
        validatedFiles.push(result.validated);
      }
    }

    if (errors.length > 0) {
      setSendError(errors.join('\n'));
    } else {
      setSendError(null);
    }

    setAttachedFiles((prev) => [...prev, ...validatedFiles]);

    // ドキュメントファイルが追加された場合、Web検索を自動的に無効化
    const hasNewDocuments = validatedFiles.some(f => f.purpose === 'assistants');
    if (hasNewDocuments && webSearchEnabled) {
      setWebSearchEnabled(false);
      setStatusMessage("ℹ️ ドキュメントファイル添付のため、Web検索を自動的に無効化しました");
    }

    // inputをリセット
    if (event.target) {
      event.target.value = '';
    }
  }, [canAttachFiles, webSearchEnabled]);

  const handleRemoveFile = useCallback((index: number) => {
    const removedFile = attachedFiles[index];
    setAttachedFiles((prev) => prev.filter((_, i) => i !== index));

    // ドキュメントファイルを削除した場合の通知
    if (removedFile?.purpose === 'assistants') {
      const remainingDocuments = attachedFiles.filter((f, i) => i !== index && f.purpose === 'assistants');
      if (remainingDocuments.length === 0) {
        setStatusMessage("ℹ️ ドキュメントファイルを削除しました。Web検索を再び有効化できます。");
      }
    }
  }, [attachedFiles]);

  const handleAttachClick = useCallback(() => {
    if (!canAttachFiles) {
      setSendError("管理者によりチャットでのファイル添付が無効化されています。");
      return;
    }
    fileInputRef.current?.click();
  }, [canAttachFiles]);

  const handleCopyMessage = useCallback(async (text: string, messageId: string) => {
    try {
      await navigator.clipboard.writeText(text);
      setCopiedMessageId(messageId);
      setTimeout(() => {
        setCopiedMessageId(null);
      }, 2000);
      console.log("メッセージをクリップボードにコピーしました");
    } catch (error) {
      console.error("コピーに失敗しました:", error);
    }
  }, []);

  const handlePresetSelect = useCallback((presetId: string) => {
    setSelectedPresetId(presetId);
    const preset = rolePresets.find((p) => p.id === presetId);
    if (preset) {
      setSystemRole(preset.content);
      void persistConversation({ systemRole: preset.content });
    }
  }, [rolePresets, persistConversation]);

  const handleSaveAsPreset = useCallback(async () => {
    if (!newPresetName.trim() || !systemRole.trim()) {
      return;
    }
    const newPreset = await addRolePreset({
      name: newPresetName.trim(),
      content: systemRole.trim(),
    });
    const updatedPresets = await loadRolePresets();
    setRolePresets(updatedPresets);
    setSelectedPresetId(newPreset.id);
    setNewPresetName("");
    setShowPresetDialog(false);
  }, [newPresetName, systemRole]);

  const handleDeletePreset = useCallback(async (presetId: string) => {
    await deleteRolePreset(presetId);
    const updatedPresets = await loadRolePresets();
    setRolePresets(updatedPresets);
    if (selectedPresetId === presetId) {
      setSelectedPresetId("");
    }
  }, [selectedPresetId]);

  const handleEditPreset = useCallback((presetId: string) => {
    const preset = rolePresets.find((p) => p.id === presetId);
    if (preset) {
      setEditingPresetId(presetId);
      setEditingPresetName(preset.name);
    }
  }, [rolePresets]);

  const handleSavePresetEdit = useCallback(async () => {
    if (!editingPresetId || !editingPresetName.trim()) {
      return;
    }
    await updateRolePreset(editingPresetId, { name: editingPresetName.trim() });
    const updatedPresets = await loadRolePresets();
    setRolePresets(updatedPresets);
    setEditingPresetId(null);
    setEditingPresetName("");
  }, [editingPresetId, editingPresetName]);

  const handleCancelPresetEdit = useCallback(() => {
    setEditingPresetId(null);
    setEditingPresetName("");
  }, []);

  const handleCopyVectorStoreId = useCallback(async (vectorStoreId: string) => {
    try {
      await navigator.clipboard.writeText(vectorStoreId);
      setCopiedVectorStoreId(vectorStoreId);
      setTimeout(() => {
        setCopiedVectorStoreId(null);
      }, 2000);
      console.log("Vector Store IDをクリップボードにコピーしました:", vectorStoreId);
    } catch (error) {
      console.error("コピーに失敗しました:", error);
    }
  }, []);

  const handleRemoveVectorStoreId = useCallback((idToRemove: string) => {
    const updatedIds = selectedVectorStoreIds.filter((id) => id !== idToRemove);
    setSelectedVectorStoreIds(updatedIds);
    void persistConversation({ vectorStoreIds: updatedIds });
  }, [selectedVectorStoreIds, persistConversation]);

  const handleAddVectorStoreId = useCallback((newId: string) => {
    const trimmed = newId.trim();
    if (!trimmed || selectedVectorStoreIds.includes(trimmed) || selectedVectorStoreIds.length >= 3) {
      return;
    }
    const updatedIds = [...selectedVectorStoreIds, trimmed];
    setSelectedVectorStoreIds(updatedIds);
    void persistConversation({ vectorStoreIds: updatedIds });
  }, [selectedVectorStoreIds, persistConversation]);

  const handleLoadOlderMessages = useCallback(async () => {
    const conversation = activeConversationRef.current;
    if (!conversation?.id || loadingOlderMessages || !hasMoreMessages || messages.length === 0) {
      return;
    }

    setLoadingOlderMessages(true);
    try {
      const oldestMessage = messages[0];
      const result = await loadConversationMessagesPaginated(conversation.id, {
        limit: 30,
        beforeMessageId: oldestMessage.id,
      });

      if (result.messages.length > 0) {
        // 古いメッセージを先頭に追加
        const updatedMessages = result.messages.concat(messages);
        setMessages(updatedMessages);
        messagesRef.current = updatedMessages;
        setHasMoreMessages(result.hasMore);
      }
    } catch (error) {
      console.error("古いメッセージの読み込みに失敗:", error);
    } finally {
      setLoadingOlderMessages(false);
    }
  }, [loadingOlderMessages, hasMoreMessages, messages]);

  const visibleConversations = useMemo(
    () => conversations.filter((conversation) => conversation.hasContent),
    [conversations],
  );

  const renderConversationList = (items: ConversationRecord[]) => (
    <ul className="conversation-list">
      {items.map((conv) => {
        const isActive = conv.id === activeConversationId;
        const isEditing = conv.id === editingConversationId;
        return (
          <li key={conv.id}>
            {isEditing ? (
              <div className="chat-history-item editing">
                <div className="chat-history-editing">
                  <div className="chat-history-edit-row">
                    <input
                      type="text"
                      className="chat-history-edit-input"
                      value={editingTitle}
                      onChange={(e) => setEditingTitle(e.target.value)}
                      onKeyDown={(e) => {
                        if (e.key === "Enter") {
                          void handleSaveTitle();
                        } else if (e.key === "Escape") {
                          handleCancelEditTitle();
                        }
                      }}
                      autoFocus
                    />
                    <div className="chat-history-edit-actions">
                      <button
                        className="chat-history-action"
                        onClick={(e) => {
                          e.stopPropagation();
                          void handleSaveTitle();
                        }}
                        title="保存"
                      >
                        ✓
                      </button>
                      <button
                        className="chat-history-action"
                        onClick={(e) => {
                          e.stopPropagation();
                          handleCancelEditTitle();
                        }}
                        title="キャンセル"
                      >
                        ✕
                      </button>
                    </div>
                  </div>
                  <div className="chat-history-tag-editor">
                    <div className="chat-history-tags">
                      {conv.tags.map((tag) => (
                        <button
                          key={tag}
                          className="chat-history-tag"
                          onClick={() => void handleRemoveTag(conv, tag)}
                          title="タグを削除"
                        >
                          #{tag} ×
                        </button>
                      ))}
                    </div>
                    <div className="chat-history-tag-input">
                      <input
                        value={editingTagInput}
                        placeholder="タグ追加"
                        onChange={(e) => setEditingTagInput(e.target.value)}
                        onKeyDown={(e) => {
                          if (e.key === "Enter") {
                            e.preventDefault();
                            void handleAddTag(conv);
                          }
                        }}
                      />
                      <button
                        className="chat-history-action"
                        onClick={() => void handleAddTag(conv)}
                        title="タグを追加"
                      >
                        追加
                      </button>
                    </div>
                  </div>
                </div>
              </div>
            ) : (
              <div
                className={`chat-history-item ${isActive ? "active" : ""}`}
                onClick={() => setActiveConversationId(conv.id)}
              >
                <span className="chat-history-icon">💬</span>
                <span className="chat-history-title">{conv.title}</span>
                <button
                  className={`chat-history-action${conv.isFavorite ? " favorite" : ""}`}
                  onClick={(e) => {
                    e.stopPropagation();
                    void handleToggleFavorite(conv);
                  }}
                  title={conv.isFavorite ? "お気に入り解除" : "お気に入り登録"}
                >
                  {conv.isFavorite ? "★" : "☆"}
                </button>
                <button
                  className="chat-history-action"
                  onClick={(e) => {
                    e.stopPropagation();
                    handleStartEditTitle(conv);
                  }}
                  title="編集"
                >
                  ✎
                </button>
                <button
                  className="chat-history-action"
                  onClick={(e) => {
                    e.stopPropagation();
                    void handleDeleteConversation(conv);
                  }}
                  title="削除"
                >
                  🗑
                </button>
              </div>
            )}
          </li>
        );
      })}
    </ul>
  );

  const connectionReady = !!connection?.apiKey;

  if (initializing) {
    return <PageLoading message="チャット画面を読み込み中..." />;
  }

  return (
    <div className="chat-layout" ref={layoutRef}>
      {historyPanelOpen && (
        <aside className="chat-sidebar-left" style={{ width: leftSidebarWidth }}>
          <header className="chat-sidebar-header">
            <h1 className="chat-sidebar-title">Chat History</h1>
            <button
              className="icon-button primary"
              onClick={handleCreateNewConversation}
              title="新しい会話"
            >
              +
            </button>
          </header>
          <nav className="chat-history-list">
            {showSearchResults ? (
              <div className="conversation-subsections">
                {searching && (
                  <div className="status-banner status-loading" role="status">
                    <div className="status-title">メッセージを検索しています…</div>
                  </div>
                )}
                {!searching && searchResults && totalMatches === 0 ? (
                  <p className="conversation-empty">入力したキーワードに一致する会話が見つかりませんでした。</p>
                ) : null}
                {searchResults?.title.length ? (
                  <div className="conversation-subsection">
                    <div className="conversation-subsection-title">タイトルに一致</div>
                    {renderConversationList(searchResults.title)}
                  </div>
                ) : null}
                {searchResults?.tags.length ? (
                  <div className="conversation-subsection">
                    <div className="conversation-subsection-title">タグに一致</div>
                    {renderConversationList(searchResults.tags)}
                  </div>
                ) : null}
                {searchResults?.messages.length ? (
                  <div className="conversation-subsection">
                    <div className="conversation-subsection-title">メッセージ本文に一致</div>
                    {renderConversationList(searchResults.messages)}
                  </div>
                ) : null}
              </div>
            ) : (
              renderConversationList(visibleConversations)
            )}
          </nav>
        </aside>
      )}
      {historyPanelOpen && (
        <div
          className={`chat-resizer${activeResize === "left" ? " chat-resizer-active" : ""}`}
          onMouseDown={(event) => startResize("left", event)}
        />
      )}

      <div className="chat-main-area" style={{ minWidth: MAIN_MIN_WIDTH }}>
        <header className="chat-header">
          <div className="chat-header-left">
            <button
              className="icon-button"
              onClick={() => setHistoryPanelOpen(!historyPanelOpen)}
              title="会話履歴"
            >
              <Clock size={20} />
            </button>
            <h1 className="chat-header-title">ChatBot</h1>
          </div>
          <button
            className="icon-button"
            onClick={() => setSettingsPanelOpen(!settingsPanelOpen)}
            title="設定"
          >
            ⚙
          </button>
        </header>

        {initializing ? (
          <main className="chat-content">
            <div className="chat-welcome">
              <p>初期化中...</p>
            </div>
          </main>
        ) : connectionError ? (
          <main className="chat-content">
            <div className="chat-welcome">
              <p className="text-error">{connectionError}</p>
              <Link className="primary-button" href="/welcome">
                設定を開く
              </Link>
            </div>
          </main>
        ) : (
          <>
            <main className="chat-content">
              {messages.length === 0 ? (
                <div className="chat-welcome">
                  <div className="chat-welcome-icon">🤖</div>
                  <h2 className="chat-welcome-title">Welcome to ChatBot</h2>
                  <p className="chat-welcome-description">
                    AIアシスタントとの会話を始めましょう。下のメッセージ欄に入力してください。
                  </p>
                </div>
              ) : (
                <div className="chat-messages-container">
                  <div className="chat-messages" aria-live="polite" style={{ fontSize: `${chatFontSize}%` }}>
                  {hasMoreMessages && (
                    <div style={{ textAlign: "center", padding: "16px 0", borderBottom: "1px solid #e0e0e0", marginBottom: "16px" }}>
                      <button
                        onClick={() => void handleLoadOlderMessages()}
                        disabled={loadingOlderMessages}
                        style={{
                          padding: "8px 16px",
                          backgroundColor: loadingOlderMessages ? "#ccc" : "#007bff",
                          color: "white",
                          border: "none",
                          borderRadius: "4px",
                          cursor: loadingOlderMessages ? "not-allowed" : "pointer",
                          fontSize: "14px",
                        }}
                      >
                        {loadingOlderMessages ? "読み込み中..." : `古いメッセージを読み込む (${totalMessageCount - messages.length}件)`}
                      </button>
                    </div>
                  )}
                  {messages.map((message) => {
                    const textPart = message.parts.find(
                      (part) => part.type === "text",
                    );
                    const role = ROLE_LABEL[message.role];

                    // デバッグ: エラーメッセージの確認
                    if (message.status === "error") {
                      console.log("Error message:", message);
                      console.log("Text part:", textPart);
                    }
                    return (
                      <div
                        key={message.id}
                        className={`chat-message chat-message-${message.role}`}
                      >
                        <div className="chat-message-meta">
                          <span className="chat-role">{role}</span>
                          <span className="chat-timestamp">
                            {formatTimestamp(message.createdAt)}
                          </span>
                          {message.status === "pending" && (
                            <span className="chat-status">送信中…</span>
                          )}
                          {message.status === "error" && (
                            <span className="chat-status error">エラー</span>
                          )}
                        </div>
                        {message.attachedFiles && message.attachedFiles.length > 0 && (
                          <div className="chat-attached-files">
                            {message.attachedFiles.map((file, index) => (
                              <div key={index} className="chat-attached-file">
                                <span className="file-icon">{file.purpose === 'vision' ? '🖼️' : '📄'}</span>
                                <span className="file-name">{file.fileName}</span>
                                <span className="file-size">({formatFileSize(file.fileSize)})</span>
                              </div>
                            ))}
                          </div>
                        )}
                        <div className="chat-content-row">
                          <div className="chat-bubble">
                            {textPart?.text ? (
                              message.role === "assistant" ? (
                                <ReactMarkdown
                                  remarkPlugins={[remarkGfm]}
                                  components={{
                                    p: ({ children }) => <p>{children}</p>,
                                  }}
                                >
                                  {textPart.text}
                                </ReactMarkdown>
                              ) : (
                                textPart.text
                              )
                            ) : (
                              <span className="chat-placeholder">(本文なし)</span>
                            )}
                          </div>
                          {textPart?.text && (
                            <button
                              className={`chat-copy-icon ${copiedMessageId === message.id ? 'copied' : ''}`}
                              onClick={() => handleCopyMessage(textPart.text, message.id)}
                              title={copiedMessageId === message.id ? 'コピーしました!' : 'メッセージをコピー'}
                            >
                              {copiedMessageId === message.id ? (
                                <svg width="16" height="16" viewBox="0 0 16 16" fill="none" xmlns="http://www.w3.org/2000/svg">
                                  <path d="M13.5 4L6 11.5L2.5 8" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round"/>
                                </svg>
                              ) : (
                                <svg width="16" height="16" viewBox="0 0 16 16" fill="none" xmlns="http://www.w3.org/2000/svg">
                                  <rect x="5" y="5" width="9" height="9" rx="1" stroke="currentColor" strokeWidth="1.5"/>
                                  <path d="M3 11V3C3 2.44772 3.44772 2 4 2H10" stroke="currentColor" strokeWidth="1.5" strokeLinecap="round"/>
                                </svg>
                              )}
                            </button>
                          )}
                        </div>
                        {message.status === "error" && message.errorDetails && (
                          <details className="chat-error-details">
                            <summary>エラー詳細</summary>
                            <pre>{message.errorDetails}</pre>
                          </details>
                        )}
                        {message.role === "assistant" && message.usedTools && message.usedTools.length > 0 && (
                          <div className="chat-tools-used">
                            <span className="tools-label">使用ツール:</span>
                            {message.usedTools.map((tool, index) => (
                              <span key={index} className={`tool-badge tool-${tool.toLowerCase().replace(/\s+/g, '-')}`}>
                                {tool}
                              </span>
                            ))}
                          </div>
                        )}
                        {message.role === "assistant" && message.tokenUsage && (
                          <div className="chat-token-usage">
                            <span className="token-label">トークン使用量:</span>
                            <span className="token-current">今回: {message.tokenUsage.totalTokens.toLocaleString()}</span>
                            {message.tokenUsage.cumulativeTotal !== undefined && (
                              <>
                                <span className="token-separator">|</span>
                                <span className="token-cumulative">
                                  累計: {message.tokenUsage.cumulativeTotal.toLocaleString()}
                                </span>
                              </>
                            )}
                          </div>
                        )}
                      </div>
                    );
                  })}
                    {isStreaming && statusMessage && (
                      <div className="chat-status-indicator">
                        <div className="status-indicator-content">
                          <div className="status-spinner">
                            <div className="spinner-dot"></div>
                            <div className="spinner-dot"></div>
                            <div className="spinner-dot"></div>
                          </div>
                          <span className="status-indicator-text">{statusMessage}</span>
                        </div>
                      </div>
                    )}
                    <div ref={messageEndRef} />
                  </div>
                </div>
              )}
            </main>

            {messages.length > 0 && (
              <div className="chat-font-controls">
                <button
                  className="chat-font-button"
                  onClick={() => setChatFontSize((prev) => Math.max(50, prev - 10))}
                  disabled={chatFontSize <= 50}
                  title="文字を小さく"
                >
                  A-
                </button>
                <span className="chat-font-size-label">{chatFontSize}%</span>
                <button
                  className="chat-font-button"
                  onClick={() => setChatFontSize(100)}
                  title="標準サイズに戻す"
                >
                  リセット
                </button>
                <button
                  className="chat-font-button"
                  onClick={() => setChatFontSize((prev) => Math.min(200, prev + 10))}
                  disabled={chatFontSize >= 200}
                  title="文字を大きく"
                >
                  A+
                </button>
              </div>
            )}

            <footer className="chat-footer">
            <div className="chat-composer">
                {attachedFiles.length > 0 && (
                  <div className="attached-files-list">
                    {attachedFiles.map((item, index) => (
                      <div key={index} className="attached-file-item">
                        <span className="file-icon">{item.isImage ? '🖼️' : '📄'}</span>
                        <span className="file-name">{item.file.name}</span>
                        <span className="file-size">({formatFileSize(item.file.size)})</span>
                        <button
                          type="button"
                          className="file-remove"
                          onClick={() => handleRemoveFile(index)}
                          disabled={isStreaming}
                        >
                          ×
                        </button>
                      </div>
                    ))}
                  </div>
                )}
                <div className="chat-input-wrapper">
                  <input
                    ref={fileInputRef}
                    type="file"
                    multiple
                    accept=".png,.jpg,.jpeg,.webp,.gif,.pdf,.txt,.docx"
                    onChange={handleFileSelect}
                    style={{ display: 'none' }}
                  />
                  <button
                    type="button"
                    className="chat-attach-button"
                    title={canAttachFiles ? "ファイル添付" : "管理者により無効化されています"}
                    onClick={handleAttachClick}
                    disabled={!connectionReady || isStreaming || !canAttachFiles}
                  >
                    📎
                  </button>
                  <textarea
                    className="field-textarea"
                    value={inputValue}
                    placeholder="メッセージを入力してください (Cmd/Ctrl + Enter で送信)"
                    rows={3}
                    onChange={(event) => setInputValue(event.target.value)}
                    onKeyDown={handleComposerKeyDown}
                    disabled={!connectionReady || isStreaming}
                  />
                  <div className="chat-actions">
                    <button
                      type="button"
                      className="primary"
                      onClick={() => void handleSend()}
                      disabled={!connectionReady || isStreaming || (!inputValue.trim() && attachedFiles.length === 0)}
                    >
                      {uploadingFiles ? "アップロード中…" : isStreaming ? "送信中…" : "送信"}
                    </button>
                    {isStreaming && (
                      <button
                        type="button"
                        className="ghost"
                        onClick={() => streamingControllerRef.current?.abort()}
                      >
                        中断
                      </button>
                    )}
                  </div>
                </div>
            </div>
          </footer>
          </>
        )}
      </div>

      {settingsPanelOpen && (
        <>
          <div
            className={`chat-resizer${activeResize === "right" ? " chat-resizer-active" : ""}`}
            onMouseDown={(event) => startResize("right", event)}
          />
          <aside className="chat-sidebar-right" style={{ width: rightSidebarWidth }}>
            <header className="chat-sidebar-header">
              <h1 className="chat-sidebar-title">Settings</h1>
            </header>
            <div className="chat-settings-panel">
              <div className="field-group">
                <label className="field-label" htmlFor="model-select">
                  Model{" "}
                  <a
                    href="https://platform.openai.com/docs/models"
                    target="_blank"
                    rel="noopener noreferrer"
                    className="field-label-link"
                  >
                    (📖 ドキュメント)
                  </a>
                </label>
                <select
                  id="model-select"
                  className="field-input"
                  value={selectedModel}
                  onChange={(e) => {
                    setSelectedModel(e.target.value);
                    void persistConversation({ modelId: e.target.value });
                  }}
                >
                  {availableModels.map((model) => (
                    <option key={model.id} value={model.id}>
                      {model.name}
                    </option>
                  ))}
                </select>
              </div>

              {canUseWebSearch && (
                <div className="settings-toggle">
                  <label className="settings-toggle-label">
                    Web Search
                    {hasDocumentAttachment && (
                      <span style={{ fontSize: '0.75rem', color: 'var(--text-secondary)', marginLeft: '4px' }}>
                        (ドキュメント添付時は無効)
                      </span>
                    )}
                  </label>
                  <button
                    className={`toggle-switch ${webSearchEnabled && !hasDocumentAttachment ? "active" : ""}`}
                    onClick={() => {
                      if (hasDocumentAttachment) {
                        setSendError("ドキュメントファイル添付時はWeb検索を使用できません。ファイルを削除するか、画像のみを添付してください。");
                        return;
                      }
                      const event = {
                        target: { checked: !webSearchEnabled },
                      } as React.ChangeEvent<HTMLInputElement>;
                      handleWebSearchToggle(event);
                    }}
                    disabled={hasDocumentAttachment}
                    style={hasDocumentAttachment ? { opacity: 0.5, cursor: 'not-allowed' } : undefined}
                  >
                    <span className="toggle-switch-slider"></span>
                  </button>
                </div>
              )}

              {canUseVectorStore && (
                <div className="settings-toggle">
                  <label className="settings-toggle-label">Vector Store</label>
                  <button
                    className={`toggle-switch ${vectorSearchEnabled ? "active" : ""}`}
                    onClick={() => {
                      const event = {
                        target: { checked: !vectorSearchEnabled },
                      } as React.ChangeEvent<HTMLInputElement>;
                      handleVectorSearchToggle(event);
                    }}
                  >
                    <span className="toggle-switch-slider"></span>
                  </button>
                </div>
              )}

              {/* 一時的なVector Storeの表示 */}
              {temporaryVectorStores.length > 0 && (
                <div className="field-group">
                  <label className="field-label" style={{ display: 'flex', alignItems: 'center', gap: '8px' }}>
                    📄 チャット添付ファイル
                    <span style={{ fontSize: '0.75rem', color: 'var(--text-secondary)' }}>
                      ({temporaryVectorStores.length}件)
                    </span>
                  </label>
                  <div className="vector-store-ids-container" style={{ flexDirection: 'column', gap: '8px' }}>
                    {temporaryVectorStores.map((store) => {
                      const expiryInfo = formatExpiryInfo(store);
                      return (
                        <div key={store.id} className="temp-vector-store-item" style={{
                          display: 'flex',
                          alignItems: 'center',
                          gap: '8px',
                          padding: '8px',
                          backgroundColor: 'var(--surface-secondary)',
                          borderRadius: '6px',
                          fontSize: '0.875rem'
                        }}>
                          <span style={{ flex: 1, overflow: 'hidden', textOverflow: 'ellipsis', whiteSpace: 'nowrap' }}>
                            {store.name}
                          </span>
                          {expiryInfo && (
                            <span style={{ fontSize: '0.75rem', color: 'var(--text-secondary)', whiteSpace: 'nowrap' }}>
                              {expiryInfo}
                            </span>
                          )}
                        </div>
                      );
                    })}
                  </div>
                  <span className="field-hint">
                    添付したドキュメントは自動的にVector Storeに保存され、会話全体で参照できます
                  </span>
                </div>
              )}

              {vectorSearchEnabled && canUseVectorStore && (
                <div className="field-group">
                  <label className="field-label">Vector Store IDs (最大3件)</label>
                  <div className="vector-store-ids-container">
                    {selectedVectorStoreIds.map((vsId) => (
                      <div key={vsId} className="vector-store-id-chip">
                        <span className="vector-store-id-text">{vsId}</span>
                        <button
                          className={`vector-store-copy-btn ${copiedVectorStoreId === vsId ? 'copied' : ''}`}
                          onClick={() => handleCopyVectorStoreId(vsId)}
                          title={copiedVectorStoreId === vsId ? 'コピーしました!' : 'IDをコピー'}
                        >
                          {copiedVectorStoreId === vsId ? (
                            <svg width="14" height="14" viewBox="0 0 16 16" fill="none" xmlns="http://www.w3.org/2000/svg">
                              <path d="M13.5 4L6 11.5L2.5 8" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round"/>
                            </svg>
                          ) : (
                            <svg width="14" height="14" viewBox="0 0 16 16" fill="none" xmlns="http://www.w3.org/2000/svg">
                              <rect x="5" y="5" width="9" height="9" rx="1" stroke="currentColor" strokeWidth="1.5"/>
                              <path d="M3 11V3C3 2.44772 3.44772 2 4 2H10" stroke="currentColor" strokeWidth="1.5"/>
                            </svg>
                          )}
                        </button>
                        <button
                          className="vector-store-remove-btn"
                          onClick={() => handleRemoveVectorStoreId(vsId)}
                          title="IDを削除"
                        >
                          <svg width="14" height="14" viewBox="0 0 16 16" fill="none" xmlns="http://www.w3.org/2000/svg">
                            <path d="M4 4L12 12M12 4L4 12" stroke="currentColor" strokeWidth="1.5" strokeLinecap="round"/>
                          </svg>
                        </button>
                      </div>
                    ))}
                    {selectedVectorStoreIds.length < 3 && (
                      <input
                        type="text"
                        className="vector-store-id-input"
                        placeholder="vs_xxxxx を入力してEnter"
                        onKeyDown={(e) => {
                          if (e.key === "Enter") {
                            handleAddVectorStoreId(e.currentTarget.value);
                            e.currentTarget.value = "";
                          }
                        }}
                      />
                    )}
                  </div>
                  <span className="field-hint">
                    Vector Store IDを入力してEnterキーで追加（例: vs_abc123）
                  </span>
                </div>
              )}

              <div className="settings-toggle">
                <label className="settings-toggle-label">System Role</label>
                <button
                  className={`toggle-switch ${systemRoleEnabled ? "active" : ""}`}
                  onClick={() => {
                    const newValue = !systemRoleEnabled;
                    setSystemRoleEnabled(newValue);
                    void persistConversation({ systemRoleEnabled: newValue });
                  }}
                >
                  <span className="toggle-switch-slider"></span>
                </button>
              </div>

              {systemRoleEnabled && (
                <>
                  <div className="field-group">
                    <label className="field-label">ロールプリセット</label>
                    <div className="role-preset-controls">
                      <select
                        className="field-input"
                        value={selectedPresetId}
                        onChange={(e) => handlePresetSelect(e.target.value)}
                      >
                        <option value="">カスタムロール</option>
                        {rolePresets.map((preset) => (
                          <option key={preset.id} value={preset.id}>
                            {preset.name}
                          </option>
                        ))}
                      </select>
                      {selectedPresetId && !rolePresets.find((p) => p.id === selectedPresetId)?.isDefault && (
                        <>
                          <button
                            className="role-preset-action-btn"
                            onClick={() => handleEditPreset(selectedPresetId)}
                            title="プリセット名を編集"
                          >
                            <svg width="16" height="16" viewBox="0 0 16 16" fill="none" xmlns="http://www.w3.org/2000/svg">
                              <path d="M11.5 2.5L13.5 4.5L5.5 12.5H3.5V10.5L11.5 2.5Z" stroke="currentColor" strokeWidth="1.5" strokeLinecap="round" strokeLinejoin="round"/>
                              <path d="M10 4L12 6" stroke="currentColor" strokeWidth="1.5" strokeLinecap="round" strokeLinejoin="round"/>
                            </svg>
                          </button>
                          <button
                            className="role-preset-action-btn delete"
                            onClick={() => handleDeletePreset(selectedPresetId)}
                            title="プリセットを削除"
                          >
                            <svg width="16" height="16" viewBox="0 0 16 16" fill="none" xmlns="http://www.w3.org/2000/svg">
                              <path d="M3 4H13" stroke="currentColor" strokeWidth="1.5" strokeLinecap="round"/>
                              <path d="M5 4V3C5 2.44772 5.44772 2 6 2H10C10.5523 2 11 2.44772 11 3V4" stroke="currentColor" strokeWidth="1.5" strokeLinecap="round"/>
                              <path d="M5 7V12" stroke="currentColor" strokeWidth="1.5" strokeLinecap="round"/>
                              <path d="M8 7V12" stroke="currentColor" strokeWidth="1.5" strokeLinecap="round"/>
                              <path d="M11 7V12" stroke="currentColor" strokeWidth="1.5" strokeLinecap="round"/>
                              <path d="M4 4L4.5 13C4.5 13.5523 4.94772 14 5.5 14H10.5C11.0523 14 11.5 13.5523 11.5 13L12 4" stroke="currentColor" strokeWidth="1.5" strokeLinecap="round"/>
                            </svg>
                          </button>
                        </>
                      )}
                    </div>
                  </div>

                  {editingPresetId && (
                    <div className="role-preset-edit-dialog-overlay" onClick={handleCancelPresetEdit}>
                      <div className="role-preset-dialog" onClick={(e) => e.stopPropagation()}>
                        <h3>プリセット名を編集</h3>
                        <input
                          type="text"
                          className="field-input"
                          placeholder="プリセット名を入力"
                          value={editingPresetName}
                          onChange={(e) => setEditingPresetName(e.target.value)}
                          onKeyDown={(e) => {
                            if (e.key === "Enter") {
                              void handleSavePresetEdit();
                            } else if (e.key === "Escape") {
                              handleCancelPresetEdit();
                            }
                          }}
                        />
                        <div className="role-preset-dialog-buttons">
                          <button onClick={handleCancelPresetEdit}>キャンセル</button>
                          <button onClick={() => void handleSavePresetEdit()} disabled={!editingPresetName.trim()}>
                            保存
                          </button>
                        </div>
                      </div>
                    </div>
                  )}

                  <div className="field-group">
                    <label className="field-label">System Role</label>
                    <textarea
                      className="field-input system-role-textarea"
                      value={systemRole}
                      onChange={(e) => {
                        setSystemRole(e.target.value);
                        setSelectedPresetId(""); // カスタム編集時はプリセット選択を解除
                      }}
                      onBlur={() => {
                        void persistConversation({ systemRole });
                      }}
                      placeholder="例: あなたは親切で丁寧なアシスタントです。"
                      rows={4}
                    />
                    <div className="role-preset-save-section">
                      <button
                        className="role-preset-save-btn"
                        onClick={() => setShowPresetDialog(true)}
                        disabled={!systemRole.trim()}
                      >
                        💾 プリセットとして保存
                      </button>
                    </div>
                    <span className="field-hint">
                      AIアシスタントの役割や性格を設定できます
                    </span>
                  </div>

                  {showPresetDialog && (
                    <div className="role-preset-dialog-overlay" onClick={() => setShowPresetDialog(false)}>
                      <div className="role-preset-dialog" onClick={(e) => e.stopPropagation()}>
                        <h3>プリセットとして保存</h3>
                        <input
                          type="text"
                          className="field-input"
                          placeholder="プリセット名を入力"
                          value={newPresetName}
                          onChange={(e) => setNewPresetName(e.target.value)}
                          onKeyDown={(e) => {
                            if (e.key === "Enter") {
                              void handleSaveAsPreset();
                            }
                          }}
                        />
                        <div className="role-preset-dialog-buttons">
                          <button onClick={() => setShowPresetDialog(false)}>キャンセル</button>
                          <button onClick={() => void handleSaveAsPreset()} disabled={!newPresetName.trim()}>
                            保存
                          </button>
                        </div>
                      </div>
                    </div>
                  )}
                </>
              )}
            </div>
          </aside>
        </>
      )}
    </div>
  );
}
