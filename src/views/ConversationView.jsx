import React from "react";
import { useLoaderData, useParams, useOutletContext } from "react-router-dom";
import MainContent from "../components/MainContent";

const ConversationView = () => {
  const { conversation } = useLoaderData();
  const { conversationId } = useParams();
  const context = useOutletContext();

  return (
    <MainContent
      currentView="chat"
      activeConversation={conversation}
      conversationId={conversationId}
      {...context}
    />
  );
};

export default ConversationView;