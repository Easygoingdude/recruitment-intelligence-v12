---
name: candidate-privacy
description: Apply mandatory candidate pseudonymisation when Recruitment Intelligence processes resumes, candidate assessments, scorecards, interviews, RAG retrieval or LLM prompts.
---

# Candidate data minimisation for Recruitment Intelligence V12

Before any LLM or RAG operation involving a candidate, replace first and last names with the initial of each in **given-name then family-name order** (e.g. Jean Dupont -> J.D.). Handle multi-part names consistently. If initials collide, use a random internal candidate reference such as J.D.-002; maintain the mapping only in a separately secured application store with role-based authorization, never in model context or retrieval indexes.

Remove direct identifiers from model-bound content: phone numbers, personal and professional email addresses, personal postal addresses, profile URLs, social media handles, personal photos, identity numbers and signatures. Examine files, metadata, document names, headers/footers, attachment titles, OCR and extracted text before sending any content to the model. Where professional context might identify someone indirectly, generalise only the minimum detail needed, preserving skills, work achievements and relevant experience. Do not send confidential raw resumes to generic shared prompt caches, logs or vector stores.

This is pseudonymisation under GDPR, **not full anonymisation**. Keep access and retention policies appropriate to personal data. Enforce the policy server-side in the application **before external API calls**, with a fail-closed validation gate and unit tests. A skill instruction is only guidance to the assistant and **cannot itself guarantee** application-level enforcement. Do not claim the site implements this control without verifying its backend.

Output and evaluation records should use the initials, not full candidate names. Do not infer protected or sensitive attributes from names or profiles, and do not use those attributes in hiring scores.
