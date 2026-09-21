"use client";
import {AreaChart,Area,XAxis,YAxis,Tooltip,ResponsiveContainer,CartesianGrid} from "recharts";
import type {Snapshot} from './types';
export default function StockChart({daily}:{daily:Snapshot['daily']}){return (<ResponsiveContainer width="100%" height={240}>
                      <AreaChart
                        data={daily.map((d) => ({
                          ...d,
                          incoming: d.incoming / 1000,
                          outgoing: d.outgoing / 1000,
                        }))}
                      >
                        <defs>
                          <linearGradient
                            id="incoming"
                            x1="0"
                            y1="0"
                            x2="0"
                            y2="1"
                          >
                            <stop
                              offset="0%"
                              stopColor="#059669"
                              stopOpacity={0.2}
                            />
                            <stop
                              offset="100%"
                              stopColor="#059669"
                              stopOpacity={0}
                            />
                          </linearGradient>
                        </defs>
                        <CartesianGrid vertical={false} stroke="#edf0f4" />
                        <XAxis
                          dataKey="day"
                          tickFormatter={(s) => s.slice(5)}
                          axisLine={false}
                          tickLine={false}
                        />
                        <YAxis axisLine={false} tickLine={false} />
                        <Tooltip />
                        <Area
                          type="monotone"
                          dataKey="incoming"
                          name="إدخال"
                          stroke="#059669"
                          fill="url(#incoming)"
                          strokeWidth={3}
                        />
                        <Area
                          type="monotone"
                          dataKey="outgoing"
                          name="إخراج"
                          stroke="#5a76e8"
                          fill="transparent"
                          strokeWidth={2}
                        />
                      </AreaChart>
                    </ResponsiveContainer>);}
