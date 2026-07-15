import { QueryClient } from "@tanstack/react-query";
import { createRouter } from "@tanstack/react-router";
import { routeTree } from "./routeTree.gen";

export const getRouter = () => {
  const queryClient = new QueryClient();

  const router = createRouter({
    routeTree,
    context: { queryClient },
    scrollRestoration: true,
    defaultPreloadStaleTime: 0,
    // Matches Vite's `base` config — "/" normally, "/hearth-heart-manage/" for
    // the GitHub Pages build, where the app isn't served from the domain root.
    basepath: import.meta.env.BASE_URL,
  });

  return router;
};
