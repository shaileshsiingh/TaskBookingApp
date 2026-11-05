import { ReactNode, useRef } from 'react';
import { Animated, Pressable, StyleProp, ViewStyle, PressableProps, GestureResponderEvent } from 'react-native';

type AnimatedPressableProps = Omit<PressableProps, 'style' | 'children'> & {
  style?: StyleProp<ViewStyle>;
  children?: ReactNode;
};

export default function AnimatedPressable({
  style,
  onPressIn,
  onPressOut,
  children,
  ...rest
}: AnimatedPressableProps) {
  const scale = useRef(new Animated.Value(1)).current;

  const handlePressIn = (event: GestureResponderEvent) => {
    Animated.spring(scale, {
      toValue: 0.96,
      useNativeDriver: true,
      speed: 50,
      bounciness: 0,
    }).start();
    onPressIn?.(event);
  };

  const handlePressOut = (event: GestureResponderEvent) => {
    Animated.spring(scale, {
      toValue: 1,
      useNativeDriver: true,
      speed: 30,
      bounciness: 6,
    }).start();
    onPressOut?.(event);
  };

  return (
    <Pressable onPressIn={handlePressIn} onPressOut={handlePressOut} {...rest}>
      <Animated.View style={[style, { transform: [{ scale }] }]}>
        {children}
      </Animated.View>
    </Pressable>
  );
}
