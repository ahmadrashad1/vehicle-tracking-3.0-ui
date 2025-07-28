"use client";

import type React from "react";

import { useState } from "react";
import { Button } from "@/components/ui/button";
import {
  Card,
  CardContent,
  CardDescription,
  CardHeader,
  CardTitle,
} from "@/components/ui/card";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { Badge } from "@/components/ui/badge";
import {
  Car,
  MapPin,
  Navigation,
  Shield,
  Users,
  Eye,
  Play,
  Zap,
  Globe,
  Activity,
  ArrowRight,
  CheckCircle,
} from "lucide-react";
import { toast } from "@/hooks/use-toast";
import { useRouter } from "next/navigation";

interface User {
  id: number;
  Name: string;
  email: string;
  password: string;
}

interface LoginResponse {
  success: boolean;
  message: string;
  userType: "admin" | "user";
  userData?: any;
}

export default function WelcomePage() {
  const [showLogin, setShowLogin] = useState(false);
  const [showRegister, setShowRegister] = useState(false);
  const [isLoading, setIsLoading] = useState(false);
  const [loginType, setLoginType] = useState<"admin" | "user">("user");

  // Login form state
  const [loginEmail, setLoginEmail] = useState("");
  const [loginPassword, setLoginPassword] = useState("");

  // Register form state
  const [registerName, setRegisterName] = useState("");
  const [registerEmail, setRegisterEmail] = useState("");
  const [registerPassword, setRegisterPassword] = useState("");
  const [confirmPassword, setConfirmPassword] = useState("");

  const router = useRouter();
  const API_BASE_URL = "http://localhost:8083";

  // Handle user registration
  const handleRegister = async (e: React.FormEvent) => {
    e.preventDefault();

    if (registerPassword !== confirmPassword) {
      toast({
        title: "Error",
        description: "Passwords do not match",
        variant: "destructive",
      });
      return;
    }

    if (registerPassword.length < 6) {
      toast({
        title: "Error",
        description: "Password must be at least 6 characters long",
        variant: "destructive",
      });
      return;
    }

    setIsLoading(true);

    try {
      const userData: User = {
        id: 0, // Will be set by backend
        Name: registerName,
        email: registerEmail,
        password: registerPassword,
      };

      const response = await fetch(`${API_BASE_URL}/api/users/register`, {
        method: "POST",
        headers: {
          "Content-Type": "application/json",
        },
        body: JSON.stringify(userData),
      });

      if (response.ok) {
        const result = await response.json();
        toast({
          title: "Registration Successful",
          description: `Welcome ${result.Name}! You can now login.`,
        });

        // Reset form and switch to login
        setRegisterName("");
        setRegisterEmail("");
        setRegisterPassword("");
        setConfirmPassword("");
        setShowRegister(false);
        setShowLogin(true);
      } else {
        const errorText = await response.text();
        throw new Error(errorText || "Registration failed");
      }
    } catch (error) {
      console.error("Registration error:", error);
      toast({
        title: "Registration Failed",
        description:
          error instanceof Error ? error.message : "Unknown error occurred",
        variant: "destructive",
      });
    } finally {
      setIsLoading(false);
    }
  };

  // Handle login
  const handleLogin = async (e: React.FormEvent) => {
    e.preventDefault();
    setIsLoading(true);

    try {
      const endpoint =
        loginType === "admin"
          ? `${API_BASE_URL}/api/admin/login`
          : `${API_BASE_URL}/api/users/login`;

      const response = await fetch(endpoint, {
        method: "POST",
        headers: {
          "Content-Type": "application/json",
        },
        body: JSON.stringify({
          email: loginEmail,
          password: loginPassword,
        }),
      });

      if (response.ok) {
        const message = await response.text();

        // Store user session data
        localStorage.setItem("userType", loginType);
        localStorage.setItem("userEmail", loginEmail);
        localStorage.setItem("isLoggedIn", "true");

        toast({
          title: "Login Successful",
          description: `Welcome ${loginType === "admin" ? "Admin" : "User"}!`,
        });

        // Redirect to main application
        router.push("/");
      } else {
        const errorText = await response.text();
        throw new Error(errorText || "Login failed");
      }
    } catch (error) {
      console.error("Login error:", error);
      toast({
        title: "Login Failed",
        description:
          error instanceof Error ? error.message : "Invalid credentials",
        variant: "destructive",
      });
    } finally {
      setIsLoading(false);
    }
  };

  const features = [
    {
      icon: <Navigation className="h-8 w-8 text-blue-500" />,
      title: "Real-time Route Planning",
      description:
        "Advanced pathfinding algorithms for optimal vehicle routing across Islamabad",
    },
    {
      icon: <Activity className="h-8 w-8 text-green-500" />,
      title: "Live Vehicle Tracking",
      description:
        "Monitor vehicle movements with real-time position updates and status tracking",
    },
    {
      icon: <Globe className="h-8 w-8 text-purple-500" />,
      title: "Interactive Map Interface",
      description:
        "Intuitive map-based controls with waypoint selection and route visualization",
    },
    {
      icon: <Zap className="h-8 w-8 text-yellow-500" />,
      title: "High-Performance Simulation",
      description:
        "Scalable simulation engine supporting multiple vehicles with customizable parameters",
    },
  ];

  const stats = [
    { label: "Waypoints", value: "12+", icon: <MapPin className="h-5 w-5" /> },
    { label: "Max Vehicles", value: "10", icon: <Car className="h-5 w-5" /> },
    {
      label: "Speed Control",
      value: "0.5x-5x",
      icon: <Play className="h-5 w-5" />,
    },
    {
      label: "Real-time",
      value: "200ms",
      icon: <Activity className="h-5 w-5" />,
    },
  ];

  if (showLogin) {
    return (
      <div className="min-h-screen bg-gradient-to-br from-blue-50 via-white to-purple-50 flex items-center justify-center p-4">
        <div className="w-full max-w-md">
          <Card className="shadow-2xl border-0">
            <CardHeader className="text-center space-y-4">
              <div className="mx-auto w-16 h-16 bg-gradient-to-r from-blue-500 to-purple-600 rounded-full flex items-center justify-center">
                <Shield className="h-8 w-8 text-white" />
              </div>
              <CardTitle className="text-2xl font-bold">Welcome Back</CardTitle>
              <CardDescription>
                Sign in to access the Vehicle Simulation System
              </CardDescription>
            </CardHeader>
            <CardContent className="space-y-6">
              {/* Login Type Selector */}
              <div className="flex gap-2">
                <Button
                  type="button"
                  variant={loginType === "user" ? "default" : "outline"}
                  className="flex-1"
                  onClick={() => setLoginType("user")}
                >
                  <Users className="h-4 w-4 mr-2" />
                  User
                </Button>
                <Button
                  type="button"
                  variant={loginType === "admin" ? "default" : "outline"}
                  className="flex-1"
                  onClick={() => setLoginType("admin")}
                >
                  <Shield className="h-4 w-4 mr-2" />
                  Admin
                </Button>
              </div>

              <form onSubmit={handleLogin} className="space-y-4">
                <div className="space-y-2">
                  <Label htmlFor="email">Email</Label>
                  <Input
                    id="email"
                    type="email"
                    placeholder="Enter your email"
                    value={loginEmail}
                    onChange={(e) => setLoginEmail(e.target.value)}
                    required
                  />
                </div>
                <div className="space-y-2">
                  <Label htmlFor="password">Password</Label>
                  <Input
                    id="password"
                    type="password"
                    placeholder="Enter your password"
                    value={loginPassword}
                    onChange={(e) => setLoginPassword(e.target.value)}
                    required
                  />
                </div>
                <Button type="submit" className="w-full" disabled={isLoading}>
                  {isLoading ? "Signing in..." : "Sign In"}
                  <ArrowRight className="h-4 w-4 ml-2" />
                </Button>
              </form>

              <div className="text-center space-y-2">
                <p className="text-sm text-gray-600">
                  Don't have an account?{" "}
                  <button
                    onClick={() => {
                      setShowLogin(false);
                      setShowRegister(true);
                    }}
                    className="text-blue-600 hover:underline font-medium"
                  >
                    Register here
                  </button>
                </p>
                <button
                  onClick={() => setShowLogin(false)}
                  className="text-sm text-gray-500 hover:underline"
                >
                  Back to home
                </button>
              </div>
            </CardContent>
          </Card>
        </div>
      </div>
    );
  }

  if (showRegister) {
    return (
      <div className="min-h-screen bg-gradient-to-br from-green-50 via-white to-blue-50 flex items-center justify-center p-4">
        <div className="w-full max-w-md">
          <Card className="shadow-2xl border-0">
            <CardHeader className="text-center space-y-4">
              <div className="mx-auto w-16 h-16 bg-gradient-to-r from-green-500 to-blue-600 rounded-full flex items-center justify-center">
                <Users className="h-8 w-8 text-white" />
              </div>
              <CardTitle className="text-2xl font-bold">
                Create Account
              </CardTitle>
              <CardDescription>
                Join the Vehicle Simulation System
              </CardDescription>
            </CardHeader>
            <CardContent className="space-y-6">
              <form onSubmit={handleRegister} className="space-y-4">
                <div className="space-y-2">
                  <Label htmlFor="name">Full Name</Label>
                  <Input
                    id="name"
                    type="text"
                    placeholder="Enter your full name"
                    value={registerName}
                    onChange={(e) => setRegisterName(e.target.value)}
                    required
                  />
                </div>
                <div className="space-y-2">
                  <Label htmlFor="email">Email</Label>
                  <Input
                    id="email"
                    type="email"
                    placeholder="Enter your email"
                    value={registerEmail}
                    onChange={(e) => setRegisterEmail(e.target.value)}
                    required
                  />
                </div>
                <div className="space-y-2">
                  <Label htmlFor="password">Password</Label>
                  <Input
                    id="password"
                    type="password"
                    placeholder="Create a password (min 6 characters)"
                    value={registerPassword}
                    onChange={(e) => setRegisterPassword(e.target.value)}
                    required
                    minLength={6}
                  />
                </div>
                <div className="space-y-2">
                  <Label htmlFor="confirmPassword">Confirm Password</Label>
                  <Input
                    id="confirmPassword"
                    type="password"
                    placeholder="Confirm your password"
                    value={confirmPassword}
                    onChange={(e) => setConfirmPassword(e.target.value)}
                    required
                  />
                </div>
                <Button type="submit" className="w-full" disabled={isLoading}>
                  {isLoading ? "Creating Account..." : "Create Account"}
                  <CheckCircle className="h-4 w-4 ml-2" />
                </Button>
              </form>

              <div className="text-center space-y-2">
                <p className="text-sm text-gray-600">
                  Already have an account?{" "}
                  <button
                    onClick={() => {
                      setShowRegister(false);
                      setShowLogin(true);
                    }}
                    className="text-blue-600 hover:underline font-medium"
                  >
                    Sign in here
                  </button>
                </p>
                <button
                  onClick={() => setShowRegister(false)}
                  className="text-sm text-gray-500 hover:underline"
                >
                  Back to home
                </button>
              </div>
            </CardContent>
          </Card>
        </div>
      </div>
    );
  }

  return (
    <div className="min-h-screen bg-gradient-to-br from-slate-50 via-blue-50 to-purple-50">
      {/* Header */}
      <header className="relative overflow-hidden bg-gradient-to-r from-blue-600 via-purple-600 to-blue-800">
        <div className="absolute inset-0 bg-black/20"></div>
        <div className="relative max-w-7xl mx-auto px-4 py-24">
          <div className="text-center space-y-8">
            <div className="inline-flex items-center gap-3 bg-white/10 backdrop-blur-sm rounded-full px-6 py-3 text-white">
              <Car className="h-6 w-6" />
              <span className="font-semibold">Vehicle Simulation System</span>
            </div>

            <h1 className="text-5xl md:text-7xl font-bold text-white leading-tight">
              Smart Vehicle
              <br />
              <span className="bg-gradient-to-r from-yellow-400 to-orange-500 bg-clip-text text-transparent">
                Simulation
              </span>
            </h1>

            <p className="text-xl md:text-2xl text-blue-100 max-w-3xl mx-auto leading-relaxed">
              Advanced real-time vehicle tracking and route optimization system
              for Islamabad. Experience cutting-edge simulation technology with
              interactive controls.
            </p>

            <div className="flex flex-col sm:flex-row gap-4 justify-center items-center pt-8">
              <Button
                size="lg"
                className="bg-white text-blue-600 hover:bg-blue-50 px-8 py-4 text-lg font-semibold shadow-xl"
                onClick={() => setShowLogin(true)}
              >
                <Shield className="h-5 w-5 mr-2" />
                Sign In
              </Button>
              <Button
                size="lg"
                variant="outline"
                className="border-white text-white hover:bg-white hover:text-blue-600 px-8 py-4 text-lg font-semibold bg-transparent"
                onClick={() => setShowRegister(true)}
              >
                <Users className="h-5 w-5 mr-2" />
                Register
              </Button>
            </div>
          </div>
        </div>

        {/* Animated background elements */}
        <div className="absolute top-20 left-10 w-20 h-20 bg-white/10 rounded-full animate-pulse"></div>
        <div className="absolute bottom-20 right-10 w-32 h-32 bg-purple-400/20 rounded-full animate-bounce"></div>
        <div className="absolute top-1/2 left-1/4 w-16 h-16 bg-yellow-400/20 rounded-full animate-ping"></div>
      </header>

      {/* Stats Section */}
      <section className="py-16 bg-white">
        <div className="max-w-7xl mx-auto px-4">
          <div className="grid grid-cols-2 md:grid-cols-4 gap-8">
            {stats.map((stat, index) => (
              <div key={index} className="text-center space-y-3">
                <div className="mx-auto w-12 h-12 bg-gradient-to-r from-blue-500 to-purple-600 rounded-full flex items-center justify-center text-white">
                  {stat.icon}
                </div>
                <div className="text-3xl font-bold text-gray-900">
                  {stat.value}
                </div>
                <div className="text-gray-600 font-medium">{stat.label}</div>
              </div>
            ))}
          </div>
        </div>
      </section>

      {/* Features Section */}
      <section className="py-20 bg-gradient-to-b from-gray-50 to-white">
        <div className="max-w-7xl mx-auto px-4">
          <div className="text-center space-y-4 mb-16">
            <Badge
              variant="secondary"
              className="px-4 py-2 text-sm font-semibold"
            >
              Features
            </Badge>
            <h2 className="text-4xl md:text-5xl font-bold text-gray-900">
              Powerful Simulation Engine
            </h2>
            <p className="text-xl text-gray-600 max-w-3xl mx-auto">
              Built with modern technology stack for real-time vehicle
              simulation and tracking
            </p>
          </div>

          <div className="grid md:grid-cols-2 gap-8">
            {features.map((feature, index) => (
              <Card
                key={index}
                className="p-8 hover:shadow-xl transition-all duration-300 border-0 bg-white/80 backdrop-blur-sm"
              >
                <CardContent className="space-y-4">
                  <div className="flex items-center gap-4">
                    {feature.icon}
                    <h3 className="text-xl font-bold text-gray-900">
                      {feature.title}
                    </h3>
                  </div>
                  <p className="text-gray-600 leading-relaxed">
                    {feature.description}
                  </p>
                </CardContent>
              </Card>
            ))}
          </div>
        </div>
      </section>

      {/* User Types Section */}
      <section className="py-20 bg-gradient-to-r from-blue-600 to-purple-700">
        <div className="max-w-7xl mx-auto px-4">
          <div className="text-center space-y-4 mb-16">
            <h2 className="text-4xl md:text-5xl font-bold text-white">
              Choose Your Role
            </h2>
            <p className="text-xl text-blue-100 max-w-3xl mx-auto">
              Different access levels for different needs
            </p>
          </div>

          <div className="grid md:grid-cols-2 gap-8 max-w-4xl mx-auto">
            {/* Admin Card */}
            <Card className="p-8 bg-white/95 backdrop-blur-sm border-0 shadow-2xl">
              <CardHeader className="text-center space-y-4">
                <div className="mx-auto w-16 h-16 bg-gradient-to-r from-red-500 to-pink-600 rounded-full flex items-center justify-center">
                  <Shield className="h-8 w-8 text-white" />
                </div>
                <CardTitle className="text-2xl font-bold text-gray-900">
                  Admin Access
                </CardTitle>
              </CardHeader>
              <CardContent className="space-y-4">
                <ul className="space-y-3">
                  <li className="flex items-center gap-3">
                    <CheckCircle className="h-5 w-5 text-green-500" />
                    <span>Full simulation control</span>
                  </li>
                  <li className="flex items-center gap-3">
                    <CheckCircle className="h-5 w-5 text-green-500" />
                    <span>Start/stop simulations</span>
                  </li>
                  <li className="flex items-center gap-3">
                    <CheckCircle className="h-5 w-5 text-green-500" />
                    <span>Manage all vehicles</span>
                  </li>
                  <li className="flex items-center gap-3">
                    <CheckCircle className="h-5 w-5 text-green-500" />
                    <span>Access all features</span>
                  </li>
                </ul>
              </CardContent>
            </Card>

            {/* User Card */}
            <Card className="p-8 bg-white/95 backdrop-blur-sm border-0 shadow-2xl">
              <CardHeader className="text-center space-y-4">
                <div className="mx-auto w-16 h-16 bg-gradient-to-r from-blue-500 to-cyan-600 rounded-full flex items-center justify-center">
                  <Eye className="h-8 w-8 text-white" />
                </div>
                <CardTitle className="text-2xl font-bold text-gray-900">
                  User Access
                </CardTitle>
              </CardHeader>
              <CardContent className="space-y-4">
                <ul className="space-y-3">
                  <li className="flex items-center gap-3">
                    <CheckCircle className="h-5 w-5 text-green-500" />
                    <span>View live simulations</span>
                  </li>
                  <li className="flex items-center gap-3">
                    <CheckCircle className="h-5 w-5 text-green-500" />
                    <span>Track specific vehicles</span>
                  </li>
                  <li className="flex items-center gap-3">
                    <CheckCircle className="h-5 w-5 text-green-500" />
                    <span>Receive notifications</span>
                  </li>
                  <li className="flex items-center gap-3">
                    <CheckCircle className="h-5 w-5 text-green-500" />
                    <span>Monitor vehicle status</span>
                  </li>
                </ul>
              </CardContent>
            </Card>
          </div>
        </div>
      </section>

      {/* CTA Section */}
      <section className="py-20 bg-white">
        <div className="max-w-4xl mx-auto text-center px-4 space-y-8">
          <h2 className="text-4xl md:text-5xl font-bold text-gray-900">
            Ready to Get Started?
          </h2>
          <p className="text-xl text-gray-600">
            Join the future of vehicle simulation and tracking technology
          </p>
          <div className="flex flex-col sm:flex-row gap-4 justify-center">
            <Button
              size="lg"
              className="px-8 py-4 text-lg font-semibold"
              onClick={() => setShowRegister(true)}
            >
              <Users className="h-5 w-5 mr-2" />
              Create Account
            </Button>
            <Button
              size="lg"
              variant="outline"
              className="px-8 py-4 text-lg font-semibold bg-transparent"
              onClick={() => setShowLogin(true)}
            >
              <Shield className="h-5 w-5 mr-2" />
              Sign In
            </Button>
          </div>
        </div>
      </section>

      {/* Footer */}
      <footer className="bg-gray-900 text-white py-12">
        <div className="max-w-7xl mx-auto px-4 text-center">
          <div className="flex items-center justify-center gap-3 mb-4">
            <Car className="h-8 w-8 text-blue-400" />
            <span className="text-2xl font-bold">
              Vehicle Simulation System
            </span>
          </div>
          <p className="text-gray-400">
            Advanced vehicle tracking and simulation for Islamabad, Pakistan
          </p>
        </div>
      </footer>
    </div>
  );
}
