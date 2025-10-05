"use client";

import "./chat.css";
import Link from "next/link";
import { useCallback, useEffect, useMemo, useRef, useState } from "react";
import type { ConnectionSettings } from "@/lib/settings/connection-storage";
import { loadConnection } from "@/lib/settings/connection-storage";
import { getAllVectorStores } from "@/lib/storage/indexed-db";
import { fetchModelsFromApi, getDefaultModels, type ModelInfo } from "@/lib/openai/models";
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
  saveConversation,
  saveMessages,
  touchConversation,
} from "@/lib/chat/session";
import { streamAssistantResponse } from "@/lib/chat/streaming";

const DEFAULT_MODEL = "gpt-4o-mini";

const ROLE_LABEL: Record<MessageRecord["role"], string> = {
  user: "You",
  assistant: "Assistant",
  system: "System",
  tool: "Tool",
};

function formatTimestamp(value: string) {
  try {
    return new Date(value).toLocaleString();
  } catch {
    return value;
  }
}

function sourceLabel(part: MessagePart) {
  if (part.type !== "source") {
    return "";
  }
  if (part.sourceType === "vector") {
    return part.title ?? "Vector Store";
  }
  if (part.sourceType === "web") {
    return part.title ?? "Web Search";
  }
  return part.title ?? "Attachment";
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
  const [availableModels, setAvailableModels] = useState<ModelInfo[]>(getDefaultModels());
  const [settingsPanelOpen, setSettingsPanelOpen] = useState(true);
  const [historyPanelOpen, setHistoryPanelOpen] = useState(true);

  const activeConversation = useMemo(
    () => conversations.find((conversation) => conversation.id === activeConversationId) ?? null,
    [conversations, activeConversationId],
  );

  const messagesRef = useRef<MessageRecord[]>(messages);
  const activeConversationRef = useRef<ConversationRecord | null>(activeConversation);
  const streamingControllerRef = useRef<AbortController | null>(null);
  const messageEndRef = useRef<HTMLDivElement | null>(null);

  useEffect(() => {
    messagesRef.current = messages;
  }, [messages]);

  useEffect(() => {
    activeConversationRef.current = activeConversation;
  }, [activeConversation]);

  useEffect(() => {
    let cancelled = false;
    (async () => {
      try {
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
            "G0 のウェルカム画面で API キーと暗号化パスフレーズを入力してください。",
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
    };
  }, []);

  useEffect(() => {
    if (!activeConversation?.id) {
      setMessages([]);
      return;
    }
    let cancelled = false;
    (async () => {
      const loaded = await loadConversationMessages(activeConversation.id);
      if (!cancelled) {
        setMessages(loaded);
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
    messageEndRef.current.scrollIntoView({ behavior: "smooth" });
  }, [messages]);

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
    if (!prompt) {
      return;
    }

    setSendError(null);
    setStatusMessage("OpenAI Responses API へ送信中…");
    setIsStreaming(true);

    const userMessage = createUserMessage(conversation.id, prompt);
    const assistantDraft = createAssistantDraft(conversation.id);

    setMessages((prev) => [...prev, userMessage, assistantDraft]);
    messagesRef.current = [...messagesRef.current, userMessage, assistantDraft];
    setInputValue("");

    try {
      await saveMessages([userMessage, assistantDraft]);

      const controller = new AbortController();
      streamingControllerRef.current = controller;

      const baseHistory = [...messagesRef.current];
      const result = await streamAssistantResponse(
        {
          connection: currentConnection,
          model: (selectedModel || DEFAULT_MODEL).trim() || DEFAULT_MODEL,
          messages: baseHistory,
          vectorStoreIds: vectorSearchEnabled ? selectedVectorStoreIds : undefined,
          webSearchEnabled,
          abortSignal: controller.signal,
        },
        {
          onTextSnapshot: (text) => {
            setMessages((current) =>
              current.map((message) =>
                message.id === assistantDraft.id
                  ? withAssistantText(message, text, "pending")
                  : message,
              ),
            );
            messagesRef.current = messagesRef.current.map((message) =>
              message.id === assistantDraft.id
                ? withAssistantText(message, text, "pending")
                : message,
            );
          },
        },
      );

      let completedAssistant: MessageRecord | null = null;
      setMessages((current) =>
        current.map((message) => {
          if (message.id !== assistantDraft.id) {
            return message;
          }
          const next = withAssistantText(
            message,
            result.text,
            "complete",
            undefined,
            result.sources,
          );
          completedAssistant = next;
          return next;
        }),
      );

      if (completedAssistant) {
        messagesRef.current = messagesRef.current.map((message) =>
          message.id === completedAssistant!.id ? completedAssistant! : message,
        );
        await saveMessages([completedAssistant]);
      }

      await persistConversation({
        modelId: selectedModel.trim() || DEFAULT_MODEL,
        webSearchEnabled,
        vectorSearchEnabled,
        vectorStoreIds: vectorSearchEnabled ? selectedVectorStoreIds : [],
      });
      setStatusMessage("応答を受信しました。");
    } catch (error) {
      console.error(error);
      const message =
        error instanceof Error ? error.message : "Responses API 呼び出しに失敗しました。";

      let failedAssistant: MessageRecord | null = null;
      setMessages((current) =>
        current.map((record) => {
          if (record.id !== assistantDraft.id) {
            return record;
          }
          const next = withAssistantText(record, message, "error", message);
          failedAssistant = next;
          return next;
        }),
      );

      if (failedAssistant) {
        messagesRef.current = messagesRef.current.map((record) =>
          record.id === failedAssistant!.id ? failedAssistant! : record,
        );
        await saveMessages([failedAssistant]);
      }

      setSendError(message);
      setStatusMessage("エラーが発生しました。");
    } finally {
      streamingControllerRef.current = null;
      setIsStreaming(false);
    }
  }, [
    connection,
    inputValue,
    isStreaming,
    persistConversation,
    selectedModel,
    selectedVectorStoreIds,
    vectorSearchEnabled,
    webSearchEnabled,
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
    });
    setConversations((prev) =>
      prev.map((conv) => (conv.id === updated.id ? updated : conv)),
    );
    setEditingConversationId(null);
    setEditingTitle("");
  }, [conversations, editingConversationId, editingTitle]);

  const handleCancelEditTitle = useCallback(() => {
    setEditingConversationId(null);
    setEditingTitle("");
  }, []);

  const handleDeleteConversation = useCallback(async (conversation: ConversationRecord) => {
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

  const conversationOptions = useMemo(() => {
    return conversations.map((conversation) => ({
      id: conversation.id,
      title: conversation.title,
    }));
  }, [conversations]);

  const connectionReady = !!connection?.apiKey;

  return (
    <div className="chat-layout">
      {/* 左サイドバー: 会話履歴 */}
      {historyPanelOpen && (
        <aside className="chat-sidebar-left">
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
          {conversations.map((conv) => {
            const isActive = conv.id === activeConversationId;
            const isEditing = conv.id === editingConversationId;
            return (
              <div
                key={conv.id}
                className={`chat-history-item ${isActive ? 'active' : ''}`}
              >
                {isEditing ? (
                  <>
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
                    <button
                      className="chat-history-action"
                      onClick={handleSaveTitle}
                      title="保存"
                    >
                      ✓
                    </button>
                    <button
                      className="chat-history-action"
                      onClick={handleCancelEditTitle}
                      title="キャンセル"
                    >
                      ✕
                    </button>
                  </>
                ) : (
                  <>
                    <span
                      className="chat-history-icon"
                      onClick={() => setActiveConversationId(conv.id)}
                    >
                      💬
                    </span>
                    <span
                      className="chat-history-title"
                      onClick={() => setActiveConversationId(conv.id)}
                    >
                      {conv.title}
                    </span>
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
                  </>
                )}
              </div>
            );
          })}
        </nav>
      </aside>
      )}

      {/* メインチャットエリア */}
      <div className="chat-main-area">
        <header className="chat-header">
          <div className="chat-header-left">
            <button
              className="icon-button"
              onClick={() => setHistoryPanelOpen(!historyPanelOpen)}
              title="会話履歴"
            >
              ☰
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
              ) : null}

              <div className="chat-messages-container">
                <div className="chat-messages" aria-live="polite">
                {messages.map((message) => {
                  const textPart = message.parts.find(
                    (part) => part.type === "text",
                  );
                  const sourceParts = message.parts.filter(
                    (part): part is MessagePart & { type: "source" } =>
                      part.type === "source",
                  );
                  const role = ROLE_LABEL[message.role];
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
                      <div className="chat-bubble">
                        {textPart?.text ?? <span className="chat-placeholder">(本文なし)</span>}
                      </div>
                      {sourceParts.length > 0 && (
                        <div className="chat-sources">
                          {sourceParts.map((source, index) => (
                            <span
                              key={`${message.id}-source-${index}`}
                              className={`chat-source chat-source-${source.sourceType}`}
                            >
                              {sourceLabel(source)}
                            </span>
                          ))}
                        </div>
                      )}
                      {message.status === "error" && message.errorMessage && (
                        <p className="chat-error">{message.errorMessage}</p>
                      )}
                    </div>
                  );
                })}
                  <div ref={messageEndRef} />
                </div>
              </div>
            </main>

            <footer className="chat-footer">
            <div className="chat-composer">
                <button
                  type="button"
                  className="chat-attach-button"
                  title="ファイル添付"
                  disabled={!connectionReady || isStreaming}
                >
                  📎
                </button>
                <textarea
                  className="field-textarea"
                  value={inputValue}
                  placeholder="質問を入力してください (Cmd/Ctrl + Enter で送信)"
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
                    disabled={!connectionReady || isStreaming || !inputValue.trim()}
                  >
                    {isStreaming ? "送信中…" : "送信"}
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
                {sendError && <p className="chat-error">{sendError}</p>}
                {statusMessage && !sendError && (
                  <p className="chat-status-text">{statusMessage}</p>
                )}
            </div>
          </footer>
          </>
        )}
      </div>

      {/* 右サイドバー: 設定パネル */}
      {settingsPanelOpen && (
        <aside className="chat-sidebar-right">
        <header className="chat-sidebar-header">
          <h1 className="chat-sidebar-title">Settings</h1>
        </header>
        <div className="chat-settings-panel">
          <div className="field-group">
            <label className="field-label" htmlFor="model-select">Model</label>
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

          <div className="settings-toggle">
            <label className="settings-toggle-label">Web Search</label>
            <button
              className={`toggle-switch ${webSearchEnabled ? 'active' : ''}`}
              onClick={() => {
                const event = { target: { checked: !webSearchEnabled } } as React.ChangeEvent<HTMLInputElement>;
                handleWebSearchToggle(event);
              }}
            >
              <span className="toggle-switch-slider"></span>
            </button>
          </div>

          <div className="settings-toggle">
            <label className="settings-toggle-label">Vector Store</label>
            <button
              className={`toggle-switch ${vectorSearchEnabled ? 'active' : ''}`}
              onClick={() => {
                const event = { target: { checked: !vectorSearchEnabled } } as React.ChangeEvent<HTMLInputElement>;
                handleVectorSearchToggle(event);
              }}
            >
              <span className="toggle-switch-slider"></span>
            </button>
          </div>

          {vectorSearchEnabled && (
            <div className="field-group">
              <label className="field-label">Vector Store IDs (カンマ区切りで最大3件)</label>
              <input
                type="text"
                className="field-input"
                value={selectedVectorStoreIds.join(", ")}
                onChange={(e) => {
                  const ids = e.target.value
                    .split(",")
                    .map((id) => id.trim())
                    .filter((id) => id.length > 0)
                    .slice(0, 3);
                  setSelectedVectorStoreIds(ids);
                  void persistConversation({ vectorStoreIds: ids });
                }}
                placeholder="vs_xxxxx, vs_yyyyy"
              />
              <span className="field-hint">
                Vector Store IDを入力してください（例: vs_abc123）
              </span>
            </div>
          )}
        </div>
      </aside>
      )}
    </div>
  );
}
