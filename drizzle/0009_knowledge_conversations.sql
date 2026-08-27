CREATE TABLE knowledge_conversations (
  id text PRIMARY KEY NOT NULL,
  created_by_user_id text NOT NULL,
  title text NOT NULL,
  deleted_at text,
  created_at text NOT NULL DEFAULT CURRENT_TIMESTAMP,
  updated_at text NOT NULL DEFAULT CURRENT_TIMESTAMP
);
CREATE INDEX knowledge_conversations_owner_idx ON knowledge_conversations(created_by_user_id);
CREATE INDEX knowledge_conversations_updated_idx ON knowledge_conversations(updated_at);
CREATE TABLE knowledge_messages (
  id text PRIMARY KEY NOT NULL,
  conversation_id text NOT NULL,
  role text NOT NULL,
  content text NOT NULL,
  mode text NOT NULL,
  error_status text,
  created_at text NOT NULL DEFAULT CURRENT_TIMESTAMP
);
CREATE INDEX knowledge_messages_conversation_idx ON knowledge_messages(conversation_id);
CREATE TABLE knowledge_message_citations (
  id text PRIMARY KEY NOT NULL,
  message_id text NOT NULL,
  document_id text NOT NULL,
  version_id text NOT NULL,
  chunk_index integer NOT NULL,
  title text NOT NULL,
  category text NOT NULL,
  source_organization text,
  document_date text,
  location text NOT NULL,
  created_at text NOT NULL DEFAULT CURRENT_TIMESTAMP
);
CREATE INDEX knowledge_message_citations_message_idx ON knowledge_message_citations(message_id);
CREATE INDEX knowledge_message_citations_document_idx ON knowledge_message_citations(document_id);
