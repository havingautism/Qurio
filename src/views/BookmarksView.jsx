import React from "react";
import MainContent from "../components/MainContent";
import { useAppContext } from "../App";

const BookmarksView = () => {
  const context = useAppContext();

  return <MainContent currentView="bookmarks" {...context} />;
};

export default BookmarksView;
