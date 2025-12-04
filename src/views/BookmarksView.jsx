import React from "react";
import { useOutletContext } from "react-router-dom";
import MainContent from "../components/MainContent";

const BookmarksView = () => {
  const context = useOutletContext();

  return <MainContent currentView="bookmarks" {...context} />;
};

export default BookmarksView;