import { RouterProvider } from "react-router";
import { router } from "./routes";
import { GLOBAL_STYLES } from "./components/shared";

export default function App() {
  return (
    <>
      <RouterProvider router={router}/>
      <style>{GLOBAL_STYLES}</style>
    </>
  );
}
