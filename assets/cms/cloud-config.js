/* Cloud saving settings. Leave both empty to use the CMS on its own (everything stays in this browser).

   To switch cloud saving on, copy two values from your Supabase project (Project Settings > API Keys / Data API):
     url      the Project URL, for example 'https://abcdefghijklmnop.supabase.co'
     anonKey  the "publishable" key (starts sb_publishable_) or, on older projects, the "anon public" key (starts eyJ)

   Both are safe to publish: the database rules in supabase/setup.sql decide what each signed-in person can see.
   Never put the "secret" or "service_role" key here; the CMS refuses to use it. See DEPLOY.md. */
window.UOL_CLOUD_CONFIG = {
  url: '',
  anonKey: ''
};
