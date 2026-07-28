import { createBrowserRouter } from "react-router";
import Page1 from "./components/Page1";
import Page2 from "./components/Page2";
import Page3 from "./components/Page3";

export const router = createBrowserRouter([
  {
    path: "/",
    Component: Page1,
  },
  {
    path: "/design",
    Component: Page2,
  },
  {
    // 历史记录，对应原先 Rails 的 cards#index
    path: "/history",
    Component: Page3,
  },
]);
