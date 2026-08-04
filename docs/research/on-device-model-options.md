# On-device model options for email action-item extraction

**Status:** Investigation only. No recommendation or decision is made in this document — the
decision is tracked separately in issue #238.

**Context:** A Mac worker (Node.js/TypeScript BullMQ job worker) fetches full email content
itself and must analyse it entirely on-device (content must never leave the Mac — a fixed
privacy constraint) to extract "action items" (e.g. "reply to X", "pay invoice Y", "schedule
meeting with Z"). This note surveys three ways to run a local LLM for that extraction step:
Ollama, Apple's Foundation Models framework, and MLX — covering invocation shape from Node,
footprint/performance, licensing, and what's known about small-model JSON-extraction quality.

**A note on sourcing:** This sandbox's outbound network policy default-denies most hosts
(`ollama.com`, `huggingface.co`, `developer.apple.com`, `machinelearning.apple.com`, `arxiv.org`
all returned "blocked by default deny policy" on direct fetch/curl); only `github.com` and
`raw.githubusercontent.com` were reachable directly. Where a primary source could not be fetched
directly, its content was retrieved via the WebSearch tool (which surfaces indexed snippets of
the same primary URL through a separate path) rather than a secondary blog's paraphrase. Each
citation below links to the actual primary source (official docs, model card, technical report,
license text); a `[via WebSearch snippet]` tag marks claims sourced that way instead of by direct
fetch, so the gap is visible rather than papered over.

---

## 1. Ollama

### Invocation shape from Node.js

Ollama runs as a local daemon exposing an HTTP API on `localhost`, port **11434** by default. The
practical integration shape for the worker is a **plain HTTP call to `http://127.0.0.1:11434`**
— no subprocess spawning, no native addon.

- Endpoints: `POST /api/generate` (single-turn completion) and `POST /api/chat` (multi-turn,
  `messages` array with `user`/`assistant`/`system`/`tool` roles). Both support streaming
  (default) or a single JSON response body with `"stream": false`.
  [Ollama API docs, `docs/api.md`](https://github.com/ollama/ollama/blob/main/docs/api.md) —
  supports endpoint shapes, default port, streaming behavior.
- Official first-party Node/TypeScript client: **`ollama-js`** (`npm i ollama`), which wraps the
  same HTTP API:
  ```js
  import ollama from 'ollama'
  const response = await ollama.chat({
    model: 'llama3.1',
    messages: [{ role: 'user', content: '...' }],
  })
  ```
  Default host is `http://127.0.0.1:11434`, overridable via `new Ollama({ host })`.
  [`ollama/ollama-js` README](https://github.com/ollama/ollama-js/blob/main/README.md) — supports
  install command, Node usage example, default host.
- `keep_alive` parameter controls how long a model stays resident in memory after a request
  (default 5 minutes); sending `keep_alive: 0` unloads it, and a warm/empty prompt can pre-load a
  model ahead of time to avoid cold-start latency on the first real request.
  [Ollama API docs, `docs/api.md`](https://github.com/ollama/ollama/blob/main/docs/api.md) —
  supports `keep_alive` semantics.

### Structured/JSON output

Ollama has first-class support for constrained JSON output via a `format` parameter on both
`/api/generate` and `/api/chat`:

- `"format": "json"` — forces well-formed JSON, but the docs caution: "It's important to instruct
  the model to use JSON in the prompt. Otherwise, the model may generate large amounts
  whitespace."
- `"format": <json-schema-object>` — a full JSON Schema can be passed, and the model's output is
  constrained to match it, e.g.:
  ```json
  {
    "model": "llama3.1:8b",
    "prompt": "...", "stream": false,
    "format": {
      "type": "object",
      "properties": { "age": {"type": "integer"}, "available": {"type": "boolean"} },
      "required": ["age", "available"]
    }
  }
  ```
  [Ollama API docs, `docs/api.md`](https://github.com/ollama/ollama/blob/main/docs/api.md) —
  supports the `format` parameter and example schema request.
- JSON-schema-constrained `format` requires **Ollama 0.3.0+**; structured outputs were announced
  as a first-class feature on the official blog on **2024-12-06**. `ollama-js`'s `chat()`/
  `generate()` expose the same `format` field, and Pydantic/Zod-style workflows (define a schema
  object, pass it in, validate the typed response) are the documented pattern.
  [Ollama Blog — "Structured outputs"](https://ollama.com/blog/structured-outputs)
  `[via WebSearch snippet]` — supports version requirement and announcement date.
  [Ollama docs — "Structured outputs"](https://docs.ollama.com/capabilities/structured-outputs)
  `[via WebSearch snippet]` — supports the format-parameter mechanism and Pydantic pattern.

### Models commonly used at 3B–8B for structured extraction

The ticket named four families; sizes/quantization/footprint below are as listed on each model's
official Ollama library tag page (`ollama.com/library/<name>`), retrieved via WebSearch snippets
since direct fetch of `ollama.com` was blocked by this sandbox's network policy:

| Model | Params | Quant tag (smallest common) | Approx. size on disk | Context | License |
|---|---|---|---|---|---|
| Llama 3.1 | 8B | `q4_0` | 4.7 GB | 128K | Llama 3.1 Community License |
| Qwen2.5 | 7B | `q4_K_M` | 4.7 GB | — | Apache 2.0 (most sizes) / Qwen license (some) |
| Phi-3.5 | 3.8B | default tag (`q4`-class) | 2.2 GB | 128K | MIT |
| Gemma 2 | 2B / 9B / 27B | `q4_0` (default) | 1.6 GB / 5.4 GB / 16 GB | 8K | Gemma Terms of Use |

Sources (all `[via WebSearch snippet]` of the primary `ollama.com/library` pages, since direct
fetch returned HTTP 403 / network-policy block):
[ollama.com/library/llama3.1](https://ollama.com/library/llama3.1),
[ollama.com/library/qwen2.5](https://ollama.com/library/qwen2.5),
[ollama.com/library/phi3.5](https://ollama.com/library/phi3.5),
[ollama.com/library/gemma2](https://ollama.com/library/gemma2).

RAM footprint at Q4 quantization roughly tracks disk size (weights are memory-mapped and mostly
resident); the Ollama library pages above are the cited source for on-disk sizes. No first-party
Ollama doc found in this pass gives a separate, authoritative "RAM required" number distinct from
model file size — flagged as a gap.

### Latency on Apple Silicon

- **First-party data exists, but only for a large MoE model, not the 3B–8B range asked about**:
  Ollama's own blog reports a new MLX-based backend (Ollama 0.19, previewed then shipped) versus
  its previous llama.cpp/Metal backend, benchmarked on an **M5 Max** running **Qwen3.5-35B-A3B**
  (NVFP4 quantization): prefill went from 1,154 → 1,810 tok/s and decode from 58 → 112 tok/s (a
  57%/93% improvement). The MLX backend has a **hard 32 GB unified-memory requirement**; below
  that, Ollama 0.19 silently falls back to the llama.cpp Metal backend "no error message, no speed
  change, no indication anything is different."
  [Ollama Blog — "Ollama is now powered by MLX on Apple Silicon in preview"](https://ollama.com/blog/mlx)
  `[via WebSearch snippet]` — supports backend, hardware, and benchmark numbers.
  [Ollama Blog — "Ollama's highest performance on Apple Silicon yet with MLX"](https://ollama.com/blog/mlx-performance)
  `[via WebSearch snippet]` — companion post title/URL found via search, not independently
  fetched; listed for completeness.
- **No first-party Ollama benchmark was found for the 3B–8B models named in the ticket
  (Llama 3.1 8B, Qwen2.5 3B/7B, Phi-3.5, Gemma2)** on Apple Silicon. Community benchmark sites
  turned up in search (e.g. token/s comparison sites, Medium/dev.to write-ups) are explicitly
  **not cited here** as they are secondary and unverified — this is a real gap in primary-source
  latency data for the model sizes actually relevant to this use case. Cold-start (model load
  into memory before first token) is governed by the `keep_alive` mechanism above, which is the
  documented lever for avoiding repeated cold starts in a long-running worker process.

---

## 2. Apple's Foundation Models framework

### What it is and availability

Announced at WWDC 2025, the Foundation Models framework gives Swift-native access to the
on-device large language model that also powers Apple Intelligence.

- **Availability**: iOS 26+, iPadOS 26+, **macOS 26 (Tahoe)+**, and visionOS 26+. Requires an
  Apple Silicon Mac capable of running Apple Intelligence, with Apple Intelligence enabled in
  System Settings, and Xcode 26 for development. Apps must check availability at runtime via
  `SystemLanguageModel.availability` since the model only runs on Apple Intelligence–capable
  hardware/regions.
  [Apple Developer — "Meet with Apple: Code along with the Foundation Models framework"](https://developer.apple.com/videos/play/meet-with-apple/205/)
  `[via WebSearch snippet]` — supports OS version, Xcode version, and Apple Intelligence
  enablement requirement.
  [Apple Machine Learning Research — "Introducing Apple's On-Device and Server Foundation Models"](https://machinelearning.apple.com/research/introducing-apple-foundation-models)
  `[via WebSearch snippet]` — supports framework availability across OS platforms.
- **Model size**: a **~3 billion parameter** on-device model, **quantized to 2 bits**, with
  KV-cache sharing across transformer blocks (Apple's tech report describes this cutting memory
  use by roughly 38%). On iPhone 15 Pro, Apple reports a time-to-first-token latency of about 0.6
  ms/prompt-token and a generation rate around 30 tokens/second (no Mac-specific first-party
  number found in this pass).
  [Apple Machine Learning Research — "Apple Intelligence Foundation Language Models Tech Report 2025"](https://machinelearning.apple.com/research/apple-foundation-models-tech-report-2025)
  `[via WebSearch snippet]` — supports parameter count, quantization, KV-cache sharing, and the
  iPhone 15 Pro latency figures.
  [arXiv:2507.13575 — "Apple Intelligence Foundation Language Models Tech Report 2025"](https://arxiv.org/abs/2507.13575)
  `[via WebSearch snippet]` — companion arXiv version of the same tech report; direct PDF fetch
  was blocked by sandbox network policy (`arxiv.org` not on the allow list).
- The framework is explicitly scoped: Apple describes it as suited to summarization, extraction,
  classification, and similar tasks, and explicitly **not** designed for world knowledge or
  advanced reasoning (the kind of task larger server-scale LLMs are used for) — extraction is
  named directly as an intended use case.
  [Apple Machine Learning Research tech report](https://machinelearning.apple.com/research/apple-foundation-models-tech-report-2025)
  `[via WebSearch snippet]` — supports the named intended-use list.

### Callability from Node.js

Foundation Models is a **Swift framework** (`import FoundationModels`), part of Apple's OS SDKs —
there is no HTTP server and no official cross-language binding. For a Node/TS worker, the only
practical integration shape is a **native bridge**:
- A small Swift command-line binary invoked as a **subprocess** from Node (spawn a compiled Swift
  executable, pass the email text on stdin or as an argument, read JSON back from stdout), or
- A native Node addon (N-API) wrapping a compiled Swift/ObjC shim, which is more work to build and
  maintain than a CLI subprocess.

No first-party Apple documentation describes a Node.js or HTTP-server integration path — this is
inferred from the framework being Swift-only, not stated by Apple as a limitation in so many
words. Flagged explicitly as inference, not a quoted primary claim.

### Structured/guided generation

Foundation Models has a purpose-built structured-output mechanism called **guided generation**:
importing the framework exposes `@Generable` and `@Guide` macros. Annotating a Swift `struct` or
`enum` with `@Generable` generates a schema at compile time that constrains the model's output via
constrained decoding, and automatically parses the model's output into a type-safe Swift value
(an initializer is generated for you) — Apple states this "fundamentally guarantees structural
correctness," as opposed to a prompt-only approach.
[Apple Developer — "Meet the Foundation Models framework" (WWDC25 session 286)](https://developer.apple.com/videos/play/wwdc2025/286/)
`[via WebSearch snippet]` — supports `@Generable`/`@Guide`, constrained decoding, and the
type-safe-parsing behavior. Direct fetch of `developer.apple.com` was blocked
(network-policy default-deny in this sandbox environment).
[Apple Developer — "Deep dive into the Foundation Models framework" (WWDC25 session 301)](https://developer.apple.com/videos/play/wwdc2025/301/)
`[via WebSearch snippet]` — companion session referenced for the same feature, not independently
fetched.

The framework also supports tool calling: a session can be given tools, the model can request a
tool call, the framework invokes the corresponding code and inserts results back into the
session's `transcript`.
[Apple Developer — WWDC25 session 286](https://developer.apple.com/videos/play/wwdc2025/286/)
`[via WebSearch snippet]` — supports the tool-calling / transcript description.

### Licensing / usage constraints

Use of the Foundation Models framework (and the model it exposes) is governed by Apple's
**"Acceptable Use Requirements for the Foundation Models framework"**, which developers agree to
by using the framework. Named prohibited uses include (non-exhaustive, as listed by Apple):
violating law/regulation; promoting or enabling violence; generating defamatory or "mean-spirited"
content; regulated healthcare/legal/financial services; employment-related decisioning or criminal
justice assessments; social scoring or predictive policing; biometric classification; circumventing
safety guardrails; and attempting to reverse-engineer, extract, or reproduce the model's training
data. App Store apps using the framework are additionally subject to **App Review Guideline
3.3.11(A)**.
[Apple Developer — "Acceptable use requirements for the Foundation Models framework"](https://developer.apple.com/apple-intelligence/acceptable-use-requirements-for-the-foundation-models-framework/)
`[via WebSearch snippet]` — supports the acceptable-use list and the App Review Guideline
reference. Direct fetch blocked by sandbox network policy.

Note: none of the named prohibited-use categories obviously cover "extracting action items from a
user's own email on their own device" — flagged for the follow-up ticket to weigh, not decided
here. This document does not take a position on whether the constraint applies.

---

## 3. MLX

### What it is

MLX is Apple's own **array framework for machine learning on Apple Silicon** ("brought to you by
Apple machine learning research"), with Python, C++, C, and Swift APIs, plus higher-level packages
(`mlx.nn`, `mlx.optimizers`) modeled on PyTorch conventions. Its defining design choice is a
**unified-memory model** — arrays live in memory shared between CPU and GPU, avoiding
copy-between-devices overhead — plus lazy evaluation and dynamic graph construction. MIT-licensed.
[`ml-explore/mlx` GitHub repo](https://github.com/ml-explore/mlx) — supports framework
description, unified-memory design, API surface, and MIT license (fetched directly; `github.com`
is reachable from this sandbox).

### `mlx-lm` (Python) and invocation from Node

`mlx-lm` is "a Python package for generating text and fine-tuning large language models on Apple
silicon with MLX," integrated with the Hugging Face Hub for model download, and supporting
quantization and LoRA fine-tuning. It's invoked either via CLI (`mlx_lm.generate --prompt "..."`,
`mlx_lm.chat`) or Python API (`from mlx_lm import load, generate`). The README documents no
Node.js or HTTP-server integration path.
[`ml-explore/mlx-lm` GitHub repo](https://github.com/ml-explore/mlx-lm) — supports package
description, CLI/API usage, Hugging Face Hub integration (fetched directly).

For the Node/TS worker, this means MLX-via-Python has **no HTTP or native-binding path
documented by the project itself** — the practical integration shape is **spawning `mlx_lm` (or a
small wrapper script around it) as a child process** from Node, passing the prompt in and parsing
stdout, or standing up a local Python HTTP shim yourself (not something the mlx-lm project ships).

### MLX Swift

`mlx-swift` is the Swift API for MLX, distributed as a Swift package (via Xcode/SwiftPM, or CMake
for Linux CPU/CUDA builds). It ships an example CLI tool, **`llm-tool`**, described as "a command
line tool for generating text using a variety of LLMs available on the Hugging Face hub" — this is
the closest primary-source example of exactly the "compiled Swift binary invoked as a subprocess
from Node" integration shape named in the research question.
[`ml-explore/mlx-swift` GitHub repo](https://github.com/ml-explore/mlx-swift) — supports Swift
package structure, `llm-tool`, and platform/build requirements (fetched directly).

### Footprint and performance

The `mlx-lm` README itself makes no quantitative performance claims — it only warns that models
large relative to available RAM "will likely be slow" and recommends prompt/KV caching for
efficiency; no benchmark numbers are given in the repo docs themselves.
[`ml-explore/mlx-lm` GitHub repo](https://github.com/ml-explore/mlx-lm) — supports the absence of
benchmark numbers and the RAM-relative-slowness caveat.

Independent-but-still-first-party performance signal: Ollama's own blog post (cited in §1) frames
its new MLX-based backend's speedup *against* its previous llama.cpp/Metal backend on Apple
Silicon, which is evidence MLX's unified-memory approach measurably outperforms the
discrete-GPU-shaped Metal path for at least the model Ollama benchmarked — but that number is
Ollama's benchmark of MLX-as-a-backend, not an MLX-project-published number, and again for a 35B
MoE model, not the 3B–8B range this ticket cares about.
[Ollama Blog — "Ollama is now powered by MLX on Apple Silicon in preview"](https://ollama.com/blog/mlx)
`[via WebSearch snippet]` — see §1 for the same citation and caveats.

Quantized model weights for the models named in the ticket are published under the
**`mlx-community`** organization on Hugging Face (e.g. 4-bit MLX conversions of Llama/Qwen/Gemma
checkpoints), consistent with `mlx-lm`'s Hugging Face Hub integration described above — direct
fetch of `huggingface.co` model-card pages was blocked by this sandbox's network policy, so
specific `mlx-community` model cards could not be independently verified in this pass and are
flagged as **not directly confirmed**, only inferred from `mlx-lm`'s documented HF Hub integration.

---

## 4. Quality expectations for small-model (3B–8B) structured JSON extraction

This is the area where primary-source evidence is thinnest, and that thinness itself is worth
stating plainly rather than papering over with secondary-source numbers.

- **Instruction-following benchmark (IFEval)** scores that could be attributed to a named primary
  source in this pass:
  - Llama 3.1 8B Instruct: **~80.4** (IFEval), per Meta's own model materials.
    [Meta — Llama 3.1 8B Instruct model card / NVIDIA NGC mirror of Meta's card](https://build.nvidia.com/meta/llama-3_1-8b-instruct/modelcard)
    `[via WebSearch snippet]` — supports the IFEval score; note this is a third-party mirror of
    Meta's own published card, used because `huggingface.co` (where Meta publishes the canonical
    card) was blocked by sandbox network policy. Treat as provisional pending direct verification
    against Meta's own page.
  - Qwen2.5's own technical report evaluates instruction-following via an **expanded, multilingual
    IFEval** (adding Arabic/Spanish/French/Indonesian/Japanese/Korean/Portuguese/Vietnamese
    examples on top of the original English set) and states post-training work "notably
    improve[s]... instruction following," but a single headline IFEval number for the 7B variant
    was not confirmed in this pass.
    [arXiv:2412.15115 — "Qwen2.5 Technical Report"](https://arxiv.org/abs/2412.15115)
    `[via WebSearch snippet]` — supports the multilingual-IFEval methodology claim; direct PDF
    fetch blocked by sandbox network policy.
  - Phi-3-mini (3.8B): Microsoft's own technical report states post-training (SFT + DPO) drove
    "substantial gains on instruction following and structure output" and that Phi-3-mini's
    overall benchmark performance (e.g. 69% MMLU, 8.38 MT-bench) "rivals... models such as Mixtral
    8x7B and GPT-3.5" — a direct, named claim that structured-output quality specifically improved
    with post-training, though no isolated JSON-extraction number is given.
    [Microsoft Research — "Phi-3 Technical Report: A Highly Capable Language Model Locally on Your Phone"](https://www.microsoft.com/en-us/research/publication/phi-3-technical-report-a-highly-capable-language-model-locally-on-your-phone/)
    `[via WebSearch snippet]` — supports the "structure output" post-training claim and the
    MMLU/MT-bench figures; arXiv companion is 2404.14219 (not independently fetched, arxiv.org
    blocked by sandbox network policy).
  - Gemma 2's own technical report (Google DeepMind, arXiv:2408.00118) was located but its specific
    IFEval numbers could not be extracted in this pass — `arxiv.org` was blocked by sandbox
    network policy, and the WebSearch snippet for this query did not surface the number. **This is
    a genuine gap**, not filled here.
    [arXiv:2408.00118 — "Gemma 2: Improving Open Language Models at a Practical Size"](https://arxiv.org/abs/2408.00118)
    — cited as the correct primary source for a follow-up to check directly; content not verified
    in this pass.

- **No primary source located in this pass evaluates "JSON action-item extraction from free-text
  email" specifically** — none of the four model families' official technical reports/model cards
  contain a benchmark matching that exact task shape (arbitrary free-text → structured JSON list
  of typed items). The closest primary evidence is:
  1. Ollama's own `format`/JSON-schema feature (§1) exists specifically because free-form
     prompting alone is unreliable for getting valid JSON out of any model, small or large — the
     feature's existence and Ollama's own doc caution about whitespace/malformed output when using
     `"format": "json"` without instructing the model in the prompt is itself first-party evidence
     that unconstrained JSON generation is not fully reliable even with the schema-constraint
     feature turned off.
     [Ollama API docs](https://github.com/ollama/ollama/blob/main/docs/api.md) — supports the
     caution about unconstrained JSON mode.
  2. Apple's own framing of guided generation (§2) — explicitly built to "fundamentally
     guarantee[] structural correctness using constrained decoding" — is itself evidence from
     Apple that prompt-only structured output (i.e., asking a small model to "output JSON" without
     grammar constraints) was not considered reliable enough to ship without a constrained-decoding
     mechanism.
     [Apple Developer — WWDC25 session 286](https://developer.apple.com/videos/play/wwdc2025/286/)
     `[via WebSearch snippet]` — supports the guided-generation rationale.
  3. General instruction-following scores (IFEval, MMLU, MT-bench, cited above) are a proxy at
     best for "will this model correctly extract action items as JSON" — they test instruction
     compliance and general knowledge, not this specific extraction task, and should be read as
     indirect signal only.

**Honest summary of this section**: primary sources establish (a) that constrained/guided
decoding (JSON-schema-constrained generation, Apple's `@Generable`) is the documented mechanism
both Ollama and Apple ship specifically to make small-model structured output reliable, implying
that unconstrained prompting alone is not treated as sufficient by either vendor, and (b) general
instruction-following benchmark scores exist for the 3B–8B range and are respectable
(high-70s/low-80s on IFEval where found). No primary source found in this pass runs the specific
"extract action items from an email as JSON" task or an equivalent function-calling/structured-
extraction leaderboard number for these exact models — that gap should be treated as open, not
inferred to be resolved favorably or unfavorably.

---

## Sources index

- [Ollama API docs (`docs/api.md`)](https://github.com/ollama/ollama/blob/main/docs/api.md) — fetched directly
- [`ollama/ollama-js` README](https://github.com/ollama/ollama-js/blob/main/README.md) — fetched directly
- [Ollama Blog — Structured outputs](https://ollama.com/blog/structured-outputs) — via WebSearch
- [Ollama docs — Structured outputs](https://docs.ollama.com/capabilities/structured-outputs) — via WebSearch
- [Ollama Blog — MLX on Apple Silicon (preview)](https://ollama.com/blog/mlx) — via WebSearch
- [Ollama Blog — MLX highest performance](https://ollama.com/blog/mlx-performance) — via WebSearch
- [ollama.com/library/llama3.1](https://ollama.com/library/llama3.1) — via WebSearch
- [ollama.com/library/qwen2.5](https://ollama.com/library/qwen2.5) — via WebSearch
- [ollama.com/library/phi3.5](https://ollama.com/library/phi3.5) — via WebSearch
- [ollama.com/library/gemma2](https://ollama.com/library/gemma2) — via WebSearch
- [Apple Developer — Meet the Foundation Models framework (WWDC25 #286)](https://developer.apple.com/videos/play/wwdc2025/286/) — via WebSearch
- [Apple Developer — Deep dive into the Foundation Models framework (WWDC25 #301)](https://developer.apple.com/videos/play/wwdc2025/301/) — via WebSearch
- [Apple Developer — Meet with Apple: Code along with Foundation Models](https://developer.apple.com/videos/play/meet-with-apple/205/) — via WebSearch
- [Apple Developer — Acceptable use requirements for the Foundation Models framework](https://developer.apple.com/apple-intelligence/acceptable-use-requirements-for-the-foundation-models-framework/) — via WebSearch
- [Apple ML Research — Introducing Apple's On-Device and Server Foundation Models](https://machinelearning.apple.com/research/introducing-apple-foundation-models) — via WebSearch
- [Apple ML Research — Apple Intelligence Foundation Language Models Tech Report 2025](https://machinelearning.apple.com/research/apple-foundation-models-tech-report-2025) — via WebSearch
- [arXiv:2507.13575 — Apple Intelligence Foundation Language Models Tech Report 2025](https://arxiv.org/abs/2507.13575) — via WebSearch
- [`ml-explore/mlx` GitHub repo](https://github.com/ml-explore/mlx) — fetched directly
- [`ml-explore/mlx-lm` GitHub repo](https://github.com/ml-explore/mlx-lm) — fetched directly
- [`ml-explore/mlx-swift` GitHub repo](https://github.com/ml-explore/mlx-swift) — fetched directly
- [Llama 3.1 Community License Agreement](https://www.llama.com/llama3_1/license/) — via WebSearch
- [Gemma Terms of Use](https://ai.google.dev/gemma/terms) — via WebSearch
- [Gemma Prohibited Use Policy](https://ai.google.dev/gemma/prohibited_use_policy) — via WebSearch
- [Meta/NVIDIA mirror — Llama 3.1 8B Instruct model card](https://build.nvidia.com/meta/llama-3_1-8b-instruct/modelcard) — via WebSearch
- [arXiv:2412.15115 — Qwen2.5 Technical Report](https://arxiv.org/abs/2412.15115) — via WebSearch
- [Microsoft Research — Phi-3 Technical Report](https://www.microsoft.com/en-us/research/publication/phi-3-technical-report-a-highly-capable-language-model-locally-on-your-phone/) — via WebSearch
- [arXiv:2408.00118 — Gemma 2 Technical Report](https://arxiv.org/abs/2408.00118) — located, not independently verified (gap noted above)
