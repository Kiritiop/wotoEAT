import React from "react";
import { View, Text, TouchableOpacity, StyleSheet } from "react-native";
import { Ionicons } from "@expo/vector-icons";

interface Props {
  children: React.ReactNode;
}

interface State {
  hasError: boolean;
  message: string;
}

/**
 * Catches unexpected JS errors anywhere in the subtree and shows a friendly
 * fallback instead of a blank screen.
 */
export class ErrorBoundary extends React.Component<Props, State> {
  constructor(props: Props) {
    super(props);
    this.state = { hasError: false, message: "" };
  }

  static getDerivedStateFromError(error: Error): State {
    return { hasError: true, message: error.message };
  }

  componentDidCatch(error: Error, info: React.ErrorInfo) {
    console.error("[ErrorBoundary]", error, info);
  }

  handleReset = () => {
    this.setState({ hasError: false, message: "" });
  };

  render() {
    if (!this.state.hasError) return this.props.children;

    return (
      <View style={styles.container}>
        <View style={styles.iconWrap}>
          <Ionicons name="warning-outline" size={48} color="#F59E0B" />
        </View>
        <Text style={styles.title}>Something went wrong</Text>
        <Text style={styles.message} numberOfLines={4}>
          {this.state.message || "An unexpected error occurred."}
        </Text>
        <TouchableOpacity style={styles.btn} onPress={this.handleReset}>
          <Ionicons name="refresh" size={16} color="#FFF" />
          <Text style={styles.btnText}>Try Again</Text>
        </TouchableOpacity>
      </View>
    );
  }
}

const styles = StyleSheet.create({
  container: {
    flex: 1,
    backgroundColor: "#F9FAFB",
    alignItems: "center",
    justifyContent: "center",
    padding: 32,
    gap: 16,
  },
  iconWrap: {
    width: 88,
    height: 88,
    borderRadius: 44,
    backgroundColor: "#FFFBEB",
    alignItems: "center",
    justifyContent: "center",
    marginBottom: 8,
  },
  title: {
    fontSize: 22,
    fontWeight: "800",
    color: "#1A1A1A",
    textAlign: "center",
  },
  message: {
    fontSize: 14,
    color: "#6B7280",
    textAlign: "center",
    lineHeight: 20,
  },
  btn: {
    flexDirection: "row",
    alignItems: "center",
    gap: 8,
    backgroundColor: "#2E7D32",
    borderRadius: 14,
    paddingVertical: 13,
    paddingHorizontal: 24,
    marginTop: 8,
  },
  btnText: { color: "#FFF", fontSize: 15, fontWeight: "700" },
});
