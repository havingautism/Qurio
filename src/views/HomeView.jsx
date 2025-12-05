import React from "react";
import MainContent from "../components/MainContent";
import { useAppContext } from "../App";

import useChatStore from "../lib/chatStore";

const HomeView = () => {
  const context = useAppContext();

  // Reset conversation state when entering Home/New Chat view
  React.useEffect(() => {
    useChatStore.getState().resetConversation();
  }, []);

  return <MainContent currentView="home" {...context} />;
};

export default HomeView;
