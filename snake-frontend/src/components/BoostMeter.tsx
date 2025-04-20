import React from 'react';

interface BoostMeterProps {
  boostAmount: number; // 0 to 100
  isBoosting: boolean;
}

const BoostMeter: React.FC<BoostMeterProps> = ({ boostAmount, isBoosting }) => {
  const fillWidth = `${boostAmount}%`;
  
  return (
    <div className="w-32 h-3 bg-gray-300 rounded-full overflow-hidden border border-gray-400">
      <div
        className={`h-full transition-all ${
          isBoosting 
            ? 'bg-gradient-to-r from-pink-500 via-yellow-300 to-blue-500 animate-pulse' 
            : 'bg-blue-500'
        }`}
        style={{ width: fillWidth }}
      ></div>
    </div>
  );
};

export default BoostMeter;
