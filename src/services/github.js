import { Octokit } from "@octokit/rest";

const SKIP_DIRS = [
    // Dependencies
    "node_modules",
    "bower_components",
    "vendor",
    "jspm_packages",
    "packages",

    // Build output
    "dist",
    "build",
    "out",
    "target",
    "bin",
    "obj",
    ".next",
    ".nuxt",
    ".output",
    ".angular",
    ".svelte-kit",
    ".vercel",
    ".turbo",
    ".cache",
    "coverage",
    "storybook-static",

    // Python
    "__pycache__",
    ".pytest_cache",
    ".mypy_cache",
    ".ruff_cache",
    ".tox",
    ".venv",
    "venv",
    "env",
    "site-packages",
    "htmlcov",

    // Java / Kotlin / Gradle
    ".gradle",

    // IDEs
    ".idea",
    ".vscode",

    // Version control
    ".git",
    ".svn",
    ".hg",

    // Miscellaneous
    "logs",
    "tmp",
    "temp",
    ".terraform",
];

const SKIP_EXTENSIONS = new Set([
    // Documents
    ".pdf",
    ".doc",
    ".docx",
    ".xls",
    ".xlsx",
    ".ppt",
    ".pptx",

    // Images
    ".png",
    ".jpg",
    ".jpeg",
    ".gif",
    ".webp",
    ".svg",
    ".ico",
    ".bmp",
    ".tiff",
    ".avif",
    ".psd",

    // Audio / Video
    ".mp3",
    ".mp4",
    ".wav",
    ".ogg",
    ".flac",
    ".aac",
    ".mov",
    ".avi",
    ".mkv",
    ".webm",

    // Archives
    ".zip",
    ".rar",
    ".7z",
    ".tar",
    ".gz",
    ".bz2",

    // Executables / binaries
    ".exe",
    ".dll",
    ".so",
    ".dylib",
    ".bin",
    ".class",
    ".jar",
    ".war",
    ".pyc",
    ".pyo",
    ".o",
    ".obj",
    ".a",
    ".lib",
    ".wasm",

    // Fonts
    ".woff",
    ".woff2",
    ".ttf",
    ".otf",
    ".eot",

    // Database / generated data
    ".db",
    ".sqlite",
    ".sqlite3",
    ".lock",
    ".map",

    // Other
    ".min.js",
    ".min.css",
]);

const SKIP_FILES = new Set([
    // Dependency lockfiles
    "package-lock.json",
    "yarn.lock",
    "pnpm-lock.yaml",
    "bun.lock",
    "bun.lockb",
    "composer.lock",
    "poetry.lock",
    "pipfile.lock",
    "uv.lock",
    "cargo.lock",
    "gemfile.lock",
    "go.sum",
    "packages.lock.json",

    // Generated / irrelevant
    ".ds_store",
    "thumbs.db",
    "npm-debug.log",
    "yarn-debug.log",
]);




  function shouldSkipFile(path, size) {
    const parts = path.split("/");
    const fileName = parts[parts.length - 1];
  
    if (parts.some((part) => SKIP_DIRS.includes(part))) return true;
    if (SKIP_FILES.has(fileName)) return true;
    if (typeof size === "number" && size > 200_000) return true;
  
    const ext = fileName.includes(".")
      ? fileName.slice(fileName.lastIndexOf(".") + 1).toLowerCase()
      : "";
  
    if (SKIP_EXTENSIONS.has(ext)) return true;
    if (fileName.endsWith(".min.js")) return true;
  
    return false;
  }

  export function parseRepo(input) {
    const clean = input
      .replace("https://github.com/", "")
      .replace("http://github.com/", "")
      .replace(/\.git$/, "");
  
    const [owner, repo] = clean.split("/");
    return { owner, repo, repoKey: `${owner}/${repo}` };
  }

  export async function fetchRepoFiles(token , owner , repo){
    const octokit = new Octokit({ auth: token });

    const { data: repoInfo } = await octokit.rest.repos.get({ owner, repo }).catch((err) => {
        if (err.status === 404) {
          throw new Error(
            `GitHub could not find ${owner}/${repo}. Fine-grained tokens (github_pat_) must include this repo.`,
          );
        }
        throw err;
      });

      const {data:tree} = await octokit.rest.git.getTree({
        owner,
        repo,
        tree_sha:repoInfo.default_branch,
        recursive:"true"
      })

      const files = [];

      for (const item of tree.tree) {
        if (item.type !== "blob") continue;
        if (shouldSkipFile(item.path, item.size)) continue;
    
        const { data: blob } = await octokit.rest.git.getBlob({
          owner,
          repo,
          file_sha: item.sha,
        });
    
        files.push({
          path: item.path,
          content: Buffer.from(blob.content, "base64").toString("utf8"),
        });
    
        if (files.length >= 200) break;
      }

      return files;
  }
