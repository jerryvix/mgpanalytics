-- Chat history shared by the website and the app (conversations, messages):
-- an Analyst answer can keep its web sources, the [{ "title", "url" }] list
-- gemini-chat returns as `sources`, so a reopened conversation still shows
-- them. Nullable with no default: questions and older answers have none.
-- Row level security is unchanged (people read and write only messages in
-- their own conversations).
alter table public.messages add column if not exists sources jsonb;

comment on column public.messages.sources is
  'Web sources of an Analyst answer, as gemini-chat returns them: [{"title": text, "url": text}]. Null for questions and older answers.';
