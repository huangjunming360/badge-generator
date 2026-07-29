import { createBrowserRouter } from "react-router";
import RootLayout from "./components/RootLayout";
import Page1 from "./components/Page1";
import Page2 from "./components/Page2";
import Page3 from "./components/Page3";
import LoginPage from "./components/LoginPage";
import RegisterPage from "./components/RegisterPage";
import SetupPage from "./components/SetupPage";
import InactivePage from "./components/InactivePage";
import ChangePasswordPage from "./components/ChangePasswordPage";

export const router = createBrowserRouter([
  {
    element: <RootLayout />,
    children: [
      { path: "/", Component: Page1 },
      { path: "/design", Component: Page2 },
      { path: "/history", Component: Page3 },
      { path: "/login", Component: LoginPage },
      { path: "/register", Component: RegisterPage },
      { path: "/setup", Component: SetupPage },
      { path: "/inactive", Component: InactivePage },
      { path: "/change-password", Component: ChangePasswordPage },
    ],
  },
]);
