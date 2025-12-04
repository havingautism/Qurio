import React from "react";
import MainContent from "../components/MainContent";
import { useAppContext } from "../App";

const SpacesView = () => {
  const context = useAppContext();

  return (
    <MainContent
      currentView="spaces"
      spaces={context?.spaces || []}
      {...context}
    />
  );
};

export default SpacesView;
