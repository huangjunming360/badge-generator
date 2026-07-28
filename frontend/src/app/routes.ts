import { createBrowserRouter } from "react-router";
import Page1 from "./components/Page1";
import Page2 from "./components/Page2";

export const router = createBrowserRouter([
  {
    path: "/",
    Component: Page1,
  },
  {
    path: "/design",
    Component: Page2,
  },
]);
