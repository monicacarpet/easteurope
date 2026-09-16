import { createContext, useContext } from "react";
import PropTypes from "prop-types";

const WorkspaceShellContext = createContext(false);

export function WorkspaceShellProvider({ children }) {
  return <WorkspaceShellContext.Provider value>{children}</WorkspaceShellContext.Provider>;
}

WorkspaceShellProvider.propTypes = {
  children: PropTypes.node.isRequired,
};

export function useWorkspaceShell() {
  return useContext(WorkspaceShellContext);
}
