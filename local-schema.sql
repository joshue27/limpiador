--
-- PostgreSQL database dump
--

\restrict l9dGA6ddhQFYODYObSktgP5LODtusbelRKuCaOO2gYNcgbToJNw2Z1xyShdtVgN

-- Dumped from database version 16.13
-- Dumped by pg_dump version 16.13

SET statement_timeout = 0;
SET lock_timeout = 0;
SET idle_in_transaction_session_timeout = 0;
SET client_encoding = 'UTF8';
SET standard_conforming_strings = on;
SELECT pg_catalog.set_config('search_path', '', false);
SET check_function_bodies = false;
SET xmloption = content;
SET client_min_messages = warning;
SET row_security = off;

--
-- Name: CampaignRecipientStatus; Type: TYPE; Schema: public; Owner: limpiador
--

CREATE TYPE public."CampaignRecipientStatus" AS ENUM (
    'PENDING',
    'QUEUED',
    'SENT',
    'DELIVERED',
    'READ',
    'FAILED',
    'SKIPPED'
);


ALTER TYPE public."CampaignRecipientStatus" OWNER TO limpiador;

--
-- Name: CampaignStatus; Type: TYPE; Schema: public; Owner: limpiador
--

CREATE TYPE public."CampaignStatus" AS ENUM (
    'DRAFT',
    'QUEUED',
    'SENDING',
    'COMPLETED',
    'FAILED',
    'CANCELLED'
);


ALTER TYPE public."CampaignStatus" OWNER TO limpiador;

--
-- Name: ConversationStatus; Type: TYPE; Schema: public; Owner: limpiador
--

CREATE TYPE public."ConversationStatus" AS ENUM (
    'UNASSIGNED',
    'MENU_PENDING',
    'DEPARTMENT_QUEUE',
    'CLAIMED'
);


ALTER TYPE public."ConversationStatus" OWNER TO limpiador;

--
-- Name: DownloadStatus; Type: TYPE; Schema: public; Owner: limpiador
--

CREATE TYPE public."DownloadStatus" AS ENUM (
    'PENDING',
    'DOWNLOADING',
    'READY',
    'FAILED'
);


ALTER TYPE public."DownloadStatus" OWNER TO limpiador;

--
-- Name: ExportStatus; Type: TYPE; Schema: public; Owner: limpiador
--

CREATE TYPE public."ExportStatus" AS ENUM (
    'PENDING',
    'RUNNING',
    'READY',
    'FAILED'
);


ALTER TYPE public."ExportStatus" OWNER TO limpiador;

--
-- Name: MessageDirection; Type: TYPE; Schema: public; Owner: limpiador
--

CREATE TYPE public."MessageDirection" AS ENUM (
    'INBOUND',
    'OUTBOUND'
);


ALTER TYPE public."MessageDirection" OWNER TO limpiador;

--
-- Name: MessageStatus; Type: TYPE; Schema: public; Owner: limpiador
--

CREATE TYPE public."MessageStatus" AS ENUM (
    'PENDING',
    'SENT',
    'DELIVERED',
    'READ',
    'FAILED',
    'RECEIVED'
);


ALTER TYPE public."MessageStatus" OWNER TO limpiador;

--
-- Name: MessageType; Type: TYPE; Schema: public; Owner: limpiador
--

CREATE TYPE public."MessageType" AS ENUM (
    'TEXT',
    'IMAGE',
    'AUDIO',
    'DOCUMENT',
    'VIDEO',
    'STICKER',
    'TEMPLATE',
    'UNKNOWN'
);


ALTER TYPE public."MessageType" OWNER TO limpiador;

--
-- Name: RestoreStatus; Type: TYPE; Schema: public; Owner: limpiador
--

CREATE TYPE public."RestoreStatus" AS ENUM (
    'PENDING',
    'RUNNING',
    'READY',
    'FAILED'
);


ALTER TYPE public."RestoreStatus" OWNER TO limpiador;

--
-- Name: UserRole; Type: TYPE; Schema: public; Owner: limpiador
--

CREATE TYPE public."UserRole" AS ENUM (
    'ADMIN',
    'OPERATOR'
);


ALTER TYPE public."UserRole" OWNER TO limpiador;

--
-- Name: UserStatus; Type: TYPE; Schema: public; Owner: limpiador
--

CREATE TYPE public."UserStatus" AS ENUM (
    'ACTIVE',
    'DISABLED'
);


ALTER TYPE public."UserStatus" OWNER TO limpiador;

SET default_tablespace = '';

SET default_table_access_method = heap;

--
-- Name: _prisma_migrations; Type: TABLE; Schema: public; Owner: limpiador
--

CREATE TABLE public._prisma_migrations (
    id character varying(36) NOT NULL,
    checksum character varying(64) NOT NULL,
    finished_at timestamp with time zone,
    migration_name character varying(255) NOT NULL,
    logs text,
    rolled_back_at timestamp with time zone,
    started_at timestamp with time zone DEFAULT now() NOT NULL,
    applied_steps_count integer DEFAULT 0 NOT NULL
);


ALTER TABLE public._prisma_migrations OWNER TO limpiador;

--
-- Name: audit_logs; Type: TABLE; Schema: public; Owner: limpiador
--

CREATE TABLE public.audit_logs (
    id text NOT NULL,
    user_id text,
    action text NOT NULL,
    entity_type text,
    entity_id text,
    metadata_json jsonb,
    ip_address text,
    user_agent text,
    created_at timestamp(3) without time zone DEFAULT CURRENT_TIMESTAMP NOT NULL
);


ALTER TABLE public.audit_logs OWNER TO limpiador;

--
-- Name: campaign_recipients; Type: TABLE; Schema: public; Owner: limpiador
--

CREATE TABLE public.campaign_recipients (
    id text NOT NULL,
    campaign_id text NOT NULL,
    contact_id text NOT NULL,
    status public."CampaignRecipientStatus" DEFAULT 'PENDING'::public."CampaignRecipientStatus" NOT NULL,
    wamid text,
    attempt_count integer DEFAULT 0 NOT NULL,
    last_error text,
    created_at timestamp(3) without time zone DEFAULT CURRENT_TIMESTAMP NOT NULL,
    updated_at timestamp(3) without time zone NOT NULL,
    csv_data jsonb
);


ALTER TABLE public.campaign_recipients OWNER TO limpiador;

--
-- Name: campaigns; Type: TABLE; Schema: public; Owner: limpiador
--

CREATE TABLE public.campaigns (
    id text NOT NULL,
    name text NOT NULL,
    template_name text NOT NULL,
    template_language text NOT NULL,
    status public."CampaignStatus" DEFAULT 'DRAFT'::public."CampaignStatus" NOT NULL,
    scheduled_at timestamp(3) without time zone,
    created_by text NOT NULL,
    created_at timestamp(3) without time zone DEFAULT CURRENT_TIMESTAMP NOT NULL,
    updated_at timestamp(3) without time zone NOT NULL,
    body_placeholder_map jsonb
);


ALTER TABLE public.campaigns OWNER TO limpiador;

--
-- Name: contacts; Type: TABLE; Schema: public; Owner: limpiador
--

CREATE TABLE public.contacts (
    id text NOT NULL,
    wa_id text NOT NULL,
    phone text NOT NULL,
    display_name text,
    opt_in_source text,
    tags text[] DEFAULT ARRAY[]::text[],
    unsubscribed boolean DEFAULT false NOT NULL,
    blocked boolean DEFAULT false NOT NULL,
    last_inbound_at timestamp(3) without time zone,
    last_window_opened_at timestamp(3) without time zone,
    last_window_opened_by text,
    created_at timestamp(3) without time zone DEFAULT CURRENT_TIMESTAMP NOT NULL,
    updated_at timestamp(3) without time zone NOT NULL,
    assigned_operator_id text
);


ALTER TABLE public.contacts OWNER TO limpiador;

--
-- Name: controlled_tags; Type: TABLE; Schema: public; Owner: limpiador
--

CREATE TABLE public.controlled_tags (
    id text NOT NULL,
    code text NOT NULL,
    name text NOT NULL,
    active boolean DEFAULT true NOT NULL,
    created_at timestamp(3) without time zone DEFAULT CURRENT_TIMESTAMP NOT NULL,
    updated_at timestamp(3) without time zone NOT NULL
);


ALTER TABLE public.controlled_tags OWNER TO limpiador;

--
-- Name: conversations; Type: TABLE; Schema: public; Owner: limpiador
--

CREATE TABLE public.conversations (
    id text NOT NULL,
    contact_id text NOT NULL,
    status public."ConversationStatus" DEFAULT 'UNASSIGNED'::public."ConversationStatus" NOT NULL,
    assigned_department_id text,
    assigned_to text,
    last_message_at timestamp(3) without time zone,
    unread_count integer DEFAULT 0 NOT NULL,
    created_at timestamp(3) without time zone DEFAULT CURRENT_TIMESTAMP NOT NULL,
    updated_at timestamp(3) without time zone NOT NULL
);


ALTER TABLE public.conversations OWNER TO limpiador;

--
-- Name: departments; Type: TABLE; Schema: public; Owner: limpiador
--

CREATE TABLE public.departments (
    id text NOT NULL,
    code text NOT NULL,
    name text NOT NULL,
    sort_order integer DEFAULT 0 NOT NULL,
    active boolean DEFAULT true NOT NULL,
    created_at timestamp(3) without time zone DEFAULT CURRENT_TIMESTAMP NOT NULL,
    updated_at timestamp(3) without time zone NOT NULL
);


ALTER TABLE public.departments OWNER TO limpiador;

--
-- Name: export_runs; Type: TABLE; Schema: public; Owner: limpiador
--

CREATE TABLE public.export_runs (
    id text NOT NULL,
    month text NOT NULL,
    status public."ExportStatus" DEFAULT 'PENDING'::public."ExportStatus" NOT NULL,
    zip_key text,
    manifest_key text,
    counts_json jsonb,
    created_by text NOT NULL,
    started_at timestamp(3) without time zone,
    completed_at timestamp(3) without time zone,
    created_at timestamp(3) without time zone DEFAULT CURRENT_TIMESTAMP NOT NULL,
    updated_at timestamp(3) without time zone NOT NULL
);


ALTER TABLE public.export_runs OWNER TO limpiador;

--
-- Name: internal_messages; Type: TABLE; Schema: public; Owner: limpiador
--

CREATE TABLE public.internal_messages (
    id text NOT NULL,
    "userId" text NOT NULL,
    body text NOT NULL,
    "createdAt" timestamp(3) without time zone DEFAULT CURRENT_TIMESTAMP NOT NULL,
    "recipientId" text,
    read_at timestamp(3) without time zone
);


ALTER TABLE public.internal_messages OWNER TO limpiador;

--
-- Name: media_assets; Type: TABLE; Schema: public; Owner: limpiador
--

CREATE TABLE public.media_assets (
    id text NOT NULL,
    message_id text NOT NULL,
    wa_media_id text NOT NULL,
    mime_type text NOT NULL,
    filename text,
    size integer,
    sha256 text,
    storage_key text,
    download_status public."DownloadStatus" DEFAULT 'PENDING'::public."DownloadStatus" NOT NULL,
    download_error text,
    is_comprobante boolean DEFAULT false NOT NULL,
    marked_by text,
    marked_at timestamp(3) without time zone,
    created_at timestamp(3) without time zone DEFAULT CURRENT_TIMESTAMP NOT NULL,
    updated_at timestamp(3) without time zone NOT NULL
);


ALTER TABLE public.media_assets OWNER TO limpiador;

--
-- Name: message_hides; Type: TABLE; Schema: public; Owner: limpiador
--

CREATE TABLE public.message_hides (
    id text NOT NULL,
    message_id text NOT NULL,
    user_id text NOT NULL,
    created_at timestamp(3) without time zone DEFAULT CURRENT_TIMESTAMP NOT NULL
);


ALTER TABLE public.message_hides OWNER TO limpiador;

--
-- Name: message_status_events; Type: TABLE; Schema: public; Owner: limpiador
--

CREATE TABLE public.message_status_events (
    id text NOT NULL,
    message_id text NOT NULL,
    status public."MessageStatus" NOT NULL,
    occurred_at timestamp(3) without time zone NOT NULL,
    raw_json jsonb,
    created_at timestamp(3) without time zone DEFAULT CURRENT_TIMESTAMP NOT NULL
);


ALTER TABLE public.message_status_events OWNER TO limpiador;

--
-- Name: message_templates; Type: TABLE; Schema: public; Owner: limpiador
--

CREATE TABLE public.message_templates (
    id text NOT NULL,
    meta_id text,
    name text NOT NULL,
    language text NOT NULL,
    category text NOT NULL,
    body text NOT NULL,
    header text,
    footer text,
    status text DEFAULT 'PENDING'::text NOT NULL,
    created_at timestamp(3) without time zone DEFAULT CURRENT_TIMESTAMP NOT NULL,
    updated_at timestamp(3) without time zone NOT NULL
);


ALTER TABLE public.message_templates OWNER TO limpiador;

--
-- Name: messages; Type: TABLE; Schema: public; Owner: limpiador
--

CREATE TABLE public.messages (
    id text NOT NULL,
    wamid text,
    contact_id text NOT NULL,
    conversation_id text NOT NULL,
    direction public."MessageDirection" NOT NULL,
    type public."MessageType" NOT NULL,
    body text,
    caption text,
    status public."MessageStatus" DEFAULT 'PENDING'::public."MessageStatus" NOT NULL,
    sent_at timestamp(3) without time zone,
    received_at timestamp(3) without time zone,
    raw_json jsonb,
    created_at timestamp(3) without time zone DEFAULT CURRENT_TIMESTAMP NOT NULL,
    updated_at timestamp(3) without time zone NOT NULL,
    hidden_globally boolean DEFAULT false NOT NULL,
    hidden_globally_at timestamp(3) without time zone,
    hidden_globally_by text
);


ALTER TABLE public.messages OWNER TO limpiador;

--
-- Name: restore_runs; Type: TABLE; Schema: public; Owner: limpiador
--

CREATE TABLE public.restore_runs (
    id text NOT NULL,
    status public."RestoreStatus" DEFAULT 'PENDING'::public."RestoreStatus" NOT NULL,
    archive_key text NOT NULL,
    original_filename text NOT NULL,
    progress integer DEFAULT 0 NOT NULL,
    counts_json jsonb,
    error text,
    created_by text NOT NULL,
    started_at timestamp(3) without time zone,
    completed_at timestamp(3) without time zone,
    created_at timestamp(3) without time zone DEFAULT CURRENT_TIMESTAMP NOT NULL,
    updated_at timestamp(3) without time zone NOT NULL
);


ALTER TABLE public.restore_runs OWNER TO limpiador;

--
-- Name: user_departments; Type: TABLE; Schema: public; Owner: limpiador
--

CREATE TABLE public.user_departments (
    user_id text NOT NULL,
    department_id text NOT NULL,
    created_at timestamp(3) without time zone DEFAULT CURRENT_TIMESTAMP NOT NULL
);


ALTER TABLE public.user_departments OWNER TO limpiador;

--
-- Name: users; Type: TABLE; Schema: public; Owner: limpiador
--

CREATE TABLE public.users (
    id text NOT NULL,
    email text NOT NULL,
    password_hash text NOT NULL,
    role public."UserRole" NOT NULL,
    status public."UserStatus" DEFAULT 'ACTIVE'::public."UserStatus" NOT NULL,
    last_login_at timestamp(3) without time zone,
    created_at timestamp(3) without time zone DEFAULT CURRENT_TIMESTAMP NOT NULL,
    updated_at timestamp(3) without time zone NOT NULL,
    name text,
    phone text,
    permissions jsonb,
    verification_code text,
    verified_at timestamp(3) without time zone,
    reset_code text,
    reset_expires timestamp(3) without time zone
);


ALTER TABLE public.users OWNER TO limpiador;

--
-- Name: _prisma_migrations _prisma_migrations_pkey; Type: CONSTRAINT; Schema: public; Owner: limpiador
--

ALTER TABLE ONLY public._prisma_migrations
    ADD CONSTRAINT _prisma_migrations_pkey PRIMARY KEY (id);


--
-- Name: audit_logs audit_logs_pkey; Type: CONSTRAINT; Schema: public; Owner: limpiador
--

ALTER TABLE ONLY public.audit_logs
    ADD CONSTRAINT audit_logs_pkey PRIMARY KEY (id);


--
-- Name: campaign_recipients campaign_recipients_pkey; Type: CONSTRAINT; Schema: public; Owner: limpiador
--

ALTER TABLE ONLY public.campaign_recipients
    ADD CONSTRAINT campaign_recipients_pkey PRIMARY KEY (id);


--
-- Name: campaigns campaigns_pkey; Type: CONSTRAINT; Schema: public; Owner: limpiador
--

ALTER TABLE ONLY public.campaigns
    ADD CONSTRAINT campaigns_pkey PRIMARY KEY (id);


--
-- Name: contacts contacts_pkey; Type: CONSTRAINT; Schema: public; Owner: limpiador
--

ALTER TABLE ONLY public.contacts
    ADD CONSTRAINT contacts_pkey PRIMARY KEY (id);


--
-- Name: controlled_tags controlled_tags_pkey; Type: CONSTRAINT; Schema: public; Owner: limpiador
--

ALTER TABLE ONLY public.controlled_tags
    ADD CONSTRAINT controlled_tags_pkey PRIMARY KEY (id);


--
-- Name: conversations conversations_pkey; Type: CONSTRAINT; Schema: public; Owner: limpiador
--

ALTER TABLE ONLY public.conversations
    ADD CONSTRAINT conversations_pkey PRIMARY KEY (id);


--
-- Name: departments departments_pkey; Type: CONSTRAINT; Schema: public; Owner: limpiador
--

ALTER TABLE ONLY public.departments
    ADD CONSTRAINT departments_pkey PRIMARY KEY (id);


--
-- Name: export_runs export_runs_pkey; Type: CONSTRAINT; Schema: public; Owner: limpiador
--

ALTER TABLE ONLY public.export_runs
    ADD CONSTRAINT export_runs_pkey PRIMARY KEY (id);


--
-- Name: internal_messages internal_messages_pkey; Type: CONSTRAINT; Schema: public; Owner: limpiador
--

ALTER TABLE ONLY public.internal_messages
    ADD CONSTRAINT internal_messages_pkey PRIMARY KEY (id);


--
-- Name: media_assets media_assets_pkey; Type: CONSTRAINT; Schema: public; Owner: limpiador
--

ALTER TABLE ONLY public.media_assets
    ADD CONSTRAINT media_assets_pkey PRIMARY KEY (id);


--
-- Name: message_hides message_hides_pkey; Type: CONSTRAINT; Schema: public; Owner: limpiador
--

ALTER TABLE ONLY public.message_hides
    ADD CONSTRAINT message_hides_pkey PRIMARY KEY (id);


--
-- Name: message_status_events message_status_events_pkey; Type: CONSTRAINT; Schema: public; Owner: limpiador
--

ALTER TABLE ONLY public.message_status_events
    ADD CONSTRAINT message_status_events_pkey PRIMARY KEY (id);


--
-- Name: message_templates message_templates_pkey; Type: CONSTRAINT; Schema: public; Owner: limpiador
--

ALTER TABLE ONLY public.message_templates
    ADD CONSTRAINT message_templates_pkey PRIMARY KEY (id);


--
-- Name: messages messages_pkey; Type: CONSTRAINT; Schema: public; Owner: limpiador
--

ALTER TABLE ONLY public.messages
    ADD CONSTRAINT messages_pkey PRIMARY KEY (id);


--
-- Name: restore_runs restore_runs_pkey; Type: CONSTRAINT; Schema: public; Owner: limpiador
--

ALTER TABLE ONLY public.restore_runs
    ADD CONSTRAINT restore_runs_pkey PRIMARY KEY (id);


--
-- Name: user_departments user_departments_pkey; Type: CONSTRAINT; Schema: public; Owner: limpiador
--

ALTER TABLE ONLY public.user_departments
    ADD CONSTRAINT user_departments_pkey PRIMARY KEY (user_id, department_id);


--
-- Name: users users_pkey; Type: CONSTRAINT; Schema: public; Owner: limpiador
--

ALTER TABLE ONLY public.users
    ADD CONSTRAINT users_pkey PRIMARY KEY (id);


--
-- Name: audit_logs_action_created_at_idx; Type: INDEX; Schema: public; Owner: limpiador
--

CREATE INDEX audit_logs_action_created_at_idx ON public.audit_logs USING btree (action, created_at);


--
-- Name: audit_logs_entity_type_entity_id_idx; Type: INDEX; Schema: public; Owner: limpiador
--

CREATE INDEX audit_logs_entity_type_entity_id_idx ON public.audit_logs USING btree (entity_type, entity_id);


--
-- Name: campaign_recipients_campaign_id_contact_id_key; Type: INDEX; Schema: public; Owner: limpiador
--

CREATE UNIQUE INDEX campaign_recipients_campaign_id_contact_id_key ON public.campaign_recipients USING btree (campaign_id, contact_id);


--
-- Name: campaign_recipients_status_idx; Type: INDEX; Schema: public; Owner: limpiador
--

CREATE INDEX campaign_recipients_status_idx ON public.campaign_recipients USING btree (status);


--
-- Name: campaign_recipients_wamid_key; Type: INDEX; Schema: public; Owner: limpiador
--

CREATE UNIQUE INDEX campaign_recipients_wamid_key ON public.campaign_recipients USING btree (wamid);


--
-- Name: contacts_display_name_idx; Type: INDEX; Schema: public; Owner: limpiador
--

CREATE INDEX contacts_display_name_idx ON public.contacts USING btree (display_name);


--
-- Name: contacts_phone_idx; Type: INDEX; Schema: public; Owner: limpiador
--

CREATE INDEX contacts_phone_idx ON public.contacts USING btree (phone);


--
-- Name: contacts_phone_key; Type: INDEX; Schema: public; Owner: limpiador
--

CREATE UNIQUE INDEX contacts_phone_key ON public.contacts USING btree (phone);


--
-- Name: contacts_wa_id_key; Type: INDEX; Schema: public; Owner: limpiador
--

CREATE UNIQUE INDEX contacts_wa_id_key ON public.contacts USING btree (wa_id);


--
-- Name: controlled_tags_active_name_idx; Type: INDEX; Schema: public; Owner: limpiador
--

CREATE INDEX controlled_tags_active_name_idx ON public.controlled_tags USING btree (active, name);


--
-- Name: controlled_tags_code_key; Type: INDEX; Schema: public; Owner: limpiador
--

CREATE UNIQUE INDEX controlled_tags_code_key ON public.controlled_tags USING btree (code);


--
-- Name: conversations_assigned_to_status_idx; Type: INDEX; Schema: public; Owner: limpiador
--

CREATE INDEX conversations_assigned_to_status_idx ON public.conversations USING btree (assigned_to, status);


--
-- Name: conversations_contact_id_key; Type: INDEX; Schema: public; Owner: limpiador
--

CREATE UNIQUE INDEX conversations_contact_id_key ON public.conversations USING btree (contact_id);


--
-- Name: conversations_last_message_at_idx; Type: INDEX; Schema: public; Owner: limpiador
--

CREATE INDEX conversations_last_message_at_idx ON public.conversations USING btree (last_message_at);


--
-- Name: conversations_status_assigned_department_id_idx; Type: INDEX; Schema: public; Owner: limpiador
--

CREATE INDEX conversations_status_assigned_department_id_idx ON public.conversations USING btree (status, assigned_department_id);


--
-- Name: departments_active_sort_order_idx; Type: INDEX; Schema: public; Owner: limpiador
--

CREATE INDEX departments_active_sort_order_idx ON public.departments USING btree (active, sort_order);


--
-- Name: departments_code_key; Type: INDEX; Schema: public; Owner: limpiador
--

CREATE UNIQUE INDEX departments_code_key ON public.departments USING btree (code);


--
-- Name: export_runs_month_status_idx; Type: INDEX; Schema: public; Owner: limpiador
--

CREATE INDEX export_runs_month_status_idx ON public.export_runs USING btree (month, status);


--
-- Name: internal_messages_createdAt_idx; Type: INDEX; Schema: public; Owner: limpiador
--

CREATE INDEX "internal_messages_createdAt_idx" ON public.internal_messages USING btree ("createdAt");


--
-- Name: internal_messages_userId_recipientId_idx; Type: INDEX; Schema: public; Owner: limpiador
--

CREATE INDEX "internal_messages_userId_recipientId_idx" ON public.internal_messages USING btree ("userId", "recipientId");


--
-- Name: media_assets_is_comprobante_created_at_idx; Type: INDEX; Schema: public; Owner: limpiador
--

CREATE INDEX media_assets_is_comprobante_created_at_idx ON public.media_assets USING btree (is_comprobante, created_at);


--
-- Name: media_assets_wa_media_id_key; Type: INDEX; Schema: public; Owner: limpiador
--

CREATE UNIQUE INDEX media_assets_wa_media_id_key ON public.media_assets USING btree (wa_media_id);


--
-- Name: message_hides_message_id_user_id_key; Type: INDEX; Schema: public; Owner: limpiador
--

CREATE UNIQUE INDEX message_hides_message_id_user_id_key ON public.message_hides USING btree (message_id, user_id);


--
-- Name: message_status_events_message_id_status_occurred_at_key; Type: INDEX; Schema: public; Owner: limpiador
--

CREATE UNIQUE INDEX message_status_events_message_id_status_occurred_at_key ON public.message_status_events USING btree (message_id, status, occurred_at);


--
-- Name: message_templates_meta_id_key; Type: INDEX; Schema: public; Owner: limpiador
--

CREATE UNIQUE INDEX message_templates_meta_id_key ON public.message_templates USING btree (meta_id);


--
-- Name: message_templates_name_key; Type: INDEX; Schema: public; Owner: limpiador
--

CREATE UNIQUE INDEX message_templates_name_key ON public.message_templates USING btree (name);


--
-- Name: messages_contact_id_created_at_idx; Type: INDEX; Schema: public; Owner: limpiador
--

CREATE INDEX messages_contact_id_created_at_idx ON public.messages USING btree (contact_id, created_at);


--
-- Name: messages_conversation_id_created_at_idx; Type: INDEX; Schema: public; Owner: limpiador
--

CREATE INDEX messages_conversation_id_created_at_idx ON public.messages USING btree (conversation_id, created_at);


--
-- Name: messages_wamid_key; Type: INDEX; Schema: public; Owner: limpiador
--

CREATE UNIQUE INDEX messages_wamid_key ON public.messages USING btree (wamid);


--
-- Name: restore_runs_status_updated_at_idx; Type: INDEX; Schema: public; Owner: limpiador
--

CREATE INDEX restore_runs_status_updated_at_idx ON public.restore_runs USING btree (status, updated_at);


--
-- Name: user_departments_department_id_idx; Type: INDEX; Schema: public; Owner: limpiador
--

CREATE INDEX user_departments_department_id_idx ON public.user_departments USING btree (department_id);


--
-- Name: users_email_key; Type: INDEX; Schema: public; Owner: limpiador
--

CREATE UNIQUE INDEX users_email_key ON public.users USING btree (email);


--
-- Name: audit_logs audit_logs_user_id_fkey; Type: FK CONSTRAINT; Schema: public; Owner: limpiador
--

ALTER TABLE ONLY public.audit_logs
    ADD CONSTRAINT audit_logs_user_id_fkey FOREIGN KEY (user_id) REFERENCES public.users(id) ON UPDATE CASCADE ON DELETE SET NULL;


--
-- Name: campaign_recipients campaign_recipients_campaign_id_fkey; Type: FK CONSTRAINT; Schema: public; Owner: limpiador
--

ALTER TABLE ONLY public.campaign_recipients
    ADD CONSTRAINT campaign_recipients_campaign_id_fkey FOREIGN KEY (campaign_id) REFERENCES public.campaigns(id) ON UPDATE CASCADE ON DELETE CASCADE;


--
-- Name: campaign_recipients campaign_recipients_contact_id_fkey; Type: FK CONSTRAINT; Schema: public; Owner: limpiador
--

ALTER TABLE ONLY public.campaign_recipients
    ADD CONSTRAINT campaign_recipients_contact_id_fkey FOREIGN KEY (contact_id) REFERENCES public.contacts(id) ON UPDATE CASCADE ON DELETE CASCADE;


--
-- Name: campaigns campaigns_created_by_fkey; Type: FK CONSTRAINT; Schema: public; Owner: limpiador
--

ALTER TABLE ONLY public.campaigns
    ADD CONSTRAINT campaigns_created_by_fkey FOREIGN KEY (created_by) REFERENCES public.users(id) ON UPDATE CASCADE ON DELETE RESTRICT;


--
-- Name: conversations conversations_assigned_department_id_fkey; Type: FK CONSTRAINT; Schema: public; Owner: limpiador
--

ALTER TABLE ONLY public.conversations
    ADD CONSTRAINT conversations_assigned_department_id_fkey FOREIGN KEY (assigned_department_id) REFERENCES public.departments(id) ON UPDATE CASCADE ON DELETE SET NULL;


--
-- Name: conversations conversations_assigned_to_fkey; Type: FK CONSTRAINT; Schema: public; Owner: limpiador
--

ALTER TABLE ONLY public.conversations
    ADD CONSTRAINT conversations_assigned_to_fkey FOREIGN KEY (assigned_to) REFERENCES public.users(id) ON UPDATE CASCADE ON DELETE SET NULL;


--
-- Name: conversations conversations_contact_id_fkey; Type: FK CONSTRAINT; Schema: public; Owner: limpiador
--

ALTER TABLE ONLY public.conversations
    ADD CONSTRAINT conversations_contact_id_fkey FOREIGN KEY (contact_id) REFERENCES public.contacts(id) ON UPDATE CASCADE ON DELETE CASCADE;


--
-- Name: export_runs export_runs_created_by_fkey; Type: FK CONSTRAINT; Schema: public; Owner: limpiador
--

ALTER TABLE ONLY public.export_runs
    ADD CONSTRAINT export_runs_created_by_fkey FOREIGN KEY (created_by) REFERENCES public.users(id) ON UPDATE CASCADE ON DELETE RESTRICT;


--
-- Name: internal_messages internal_messages_recipientId_fkey; Type: FK CONSTRAINT; Schema: public; Owner: limpiador
--

ALTER TABLE ONLY public.internal_messages
    ADD CONSTRAINT "internal_messages_recipientId_fkey" FOREIGN KEY ("recipientId") REFERENCES public.users(id) ON UPDATE CASCADE ON DELETE SET NULL;


--
-- Name: internal_messages internal_messages_userId_fkey; Type: FK CONSTRAINT; Schema: public; Owner: limpiador
--

ALTER TABLE ONLY public.internal_messages
    ADD CONSTRAINT "internal_messages_userId_fkey" FOREIGN KEY ("userId") REFERENCES public.users(id) ON UPDATE CASCADE ON DELETE RESTRICT;


--
-- Name: media_assets media_assets_marked_by_fkey; Type: FK CONSTRAINT; Schema: public; Owner: limpiador
--

ALTER TABLE ONLY public.media_assets
    ADD CONSTRAINT media_assets_marked_by_fkey FOREIGN KEY (marked_by) REFERENCES public.users(id) ON UPDATE CASCADE ON DELETE SET NULL;


--
-- Name: media_assets media_assets_message_id_fkey; Type: FK CONSTRAINT; Schema: public; Owner: limpiador
--

ALTER TABLE ONLY public.media_assets
    ADD CONSTRAINT media_assets_message_id_fkey FOREIGN KEY (message_id) REFERENCES public.messages(id) ON UPDATE CASCADE ON DELETE CASCADE;


--
-- Name: message_hides message_hides_message_id_fkey; Type: FK CONSTRAINT; Schema: public; Owner: limpiador
--

ALTER TABLE ONLY public.message_hides
    ADD CONSTRAINT message_hides_message_id_fkey FOREIGN KEY (message_id) REFERENCES public.messages(id) ON UPDATE CASCADE ON DELETE CASCADE;


--
-- Name: message_status_events message_status_events_message_id_fkey; Type: FK CONSTRAINT; Schema: public; Owner: limpiador
--

ALTER TABLE ONLY public.message_status_events
    ADD CONSTRAINT message_status_events_message_id_fkey FOREIGN KEY (message_id) REFERENCES public.messages(id) ON UPDATE CASCADE ON DELETE CASCADE;


--
-- Name: messages messages_contact_id_fkey; Type: FK CONSTRAINT; Schema: public; Owner: limpiador
--

ALTER TABLE ONLY public.messages
    ADD CONSTRAINT messages_contact_id_fkey FOREIGN KEY (contact_id) REFERENCES public.contacts(id) ON UPDATE CASCADE ON DELETE CASCADE;


--
-- Name: messages messages_conversation_id_fkey; Type: FK CONSTRAINT; Schema: public; Owner: limpiador
--

ALTER TABLE ONLY public.messages
    ADD CONSTRAINT messages_conversation_id_fkey FOREIGN KEY (conversation_id) REFERENCES public.conversations(id) ON UPDATE CASCADE ON DELETE CASCADE;


--
-- Name: restore_runs restore_runs_created_by_fkey; Type: FK CONSTRAINT; Schema: public; Owner: limpiador
--

ALTER TABLE ONLY public.restore_runs
    ADD CONSTRAINT restore_runs_created_by_fkey FOREIGN KEY (created_by) REFERENCES public.users(id) ON UPDATE CASCADE ON DELETE RESTRICT;


--
-- Name: user_departments user_departments_department_id_fkey; Type: FK CONSTRAINT; Schema: public; Owner: limpiador
--

ALTER TABLE ONLY public.user_departments
    ADD CONSTRAINT user_departments_department_id_fkey FOREIGN KEY (department_id) REFERENCES public.departments(id) ON UPDATE CASCADE ON DELETE CASCADE;


--
-- Name: user_departments user_departments_user_id_fkey; Type: FK CONSTRAINT; Schema: public; Owner: limpiador
--

ALTER TABLE ONLY public.user_departments
    ADD CONSTRAINT user_departments_user_id_fkey FOREIGN KEY (user_id) REFERENCES public.users(id) ON UPDATE CASCADE ON DELETE CASCADE;


--
-- PostgreSQL database dump complete
--

\unrestrict l9dGA6ddhQFYODYObSktgP5LODtusbelRKuCaOO2gYNcgbToJNw2Z1xyShdtVgN

