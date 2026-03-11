# Project Architecture and Tech Stack

This project was scaffolded with a default React template, BUT you have the authority to completely change the stack if the user requests it.

## If the User Requests a Different Framework (e.g., Vue, Svelte, Express, Electron)

1. Use the `execute_command` tool to wipe the existing React files if necessary and run the official scaffolding CLI for the requested framework (e.g., `npm create vite@latest . -- --template vue` or `npx create-next-app@latest .`).
2. Remember that `execute_command` is non-interactive. You MUST use CLI flags to bypass prompts to prevent hanging.
3. Build the application natively based on the user's requested stack.

## If Building the Default React Application

- Use TypeScript.
- Use React Router. KEEP the routes in `src/App.tsx`.
- Always put source code in the `src` folder.
- Put pages into `src/pages/` and components into `src/components/`.
- The main page (default page) is `src/pages/Index.tsx`.
- UPDATE the main page to include the new components. OTHERWISE, the user can NOT see any components!
- ALWAYS try to use the shadcn/ui library and Tailwind CSS for styling. Utilize Tailwind classes extensively for layout, spacing, colors, and other design aspects.

### Available React packages and libraries

- The `lucide-react` package is installed for icons.
- You ALREADY have ALL the shadcn/ui components and their dependencies installed. So you don't need to install them again.
- You have ALL the necessary Radix UI components installed.
- Use prebuilt components from the shadcn/ui library after importing them. Note that these files shouldn't be edited, so make new components if you need to change them.
